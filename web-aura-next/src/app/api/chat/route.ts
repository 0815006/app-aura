import { createDeepSeek } from "@ai-sdk/deepseek";
import { streamText } from "ai";

import { db } from "@/lib/db/client";
import { chatMessages, userModelConfigs } from "@/lib/db/schema";
import { ensureDataDirs, isServerMode, getWorkspaceRootForUser } from "@/lib/env";
import { getAuthenticatedUser } from "@/lib/auth";
import { decrypt } from "@/lib/auth/crypto";
import { eq, and } from "drizzle-orm";

import {
  listDirectory,
  previewFileLines,
  readFileFull,
  writeTextFile,
  generateStructuredExcel,
  executePythonCode,
  webSearch,
  httpRequest,
} from "@/lib/agent/tools";

/**
 * Aura 智能体核心路由 — POST /api/chat
 *
 * ★ Phase 4: 双模式 Key 解析
 *
 * 1. 客户端模式（Header 携带 X-Aura-Local-Key）：
 *    - 从请求 body 中读取完整模型配置（apiKey, baseUrl, modelName, workspacePath）
 *    - Key 用完即焚，不落库
 *    - 不需要 JWT 鉴权
 *
 * 2. 服务端模式：
 *    - 从 Cookie 解析 JWT，获取 userId
 *    - 从 user_model_configs 表查询用户选定/默认的模型配置
 *    - 解密 apiKey 后动态创建 provider
 *    - 工作空间路径 = DATA_ROOT/workspaces/user_{userId}/{workspaceId}
 *
 * 规范要点：
 * - 流式优先：使用 streamText 而非 generateText
 * - 工具异常隔离：Tool 失败绝不导致主 Chat 流中断
 * - 超时熔断：调用外部系统显式设置 Timeout（默认 10 秒）
 * - 会话持久化：onFinish 回调中将多轮对话增量写入 PostgreSQL
 */

// ============================================================
// 8 大原子工具注册表
// ============================================================

const auraTools = {
  // 一、文件与目录感知类
  listDirectory,
  previewFileLines,
  readFileFull,

  // 二、资产产出与修改类
  writeTextFile,
  generateStructuredExcel,

  // 三、动态计算与代码执行类
  executePythonCode,

  // 四、外部世界连接类
  webSearch,
  httpRequest,
};

// ============================================================
// POST /api/chat
// ============================================================

export async function POST(req: Request) {
  // 服务端启动时确保数据目录存在
  if (isServerMode()) {
    ensureDataDirs();
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;

    const prompt: string = body.prompt ?? "";
    const sessionId: string = body.sessionId ?? body.chatId ?? "default";
    const workspaceId: string | null = body.workspaceId ?? null;
    const selectedConfigId: string | null = body.modelConfigId ?? null;

    // ReAct 最大工具调用步数（防止无限循环消耗 Token）
    const maxSteps: number = body.maxSteps ?? 10;

    // ============================================================
    // ★ Phase 4: 双模式 Key 解析
    // ============================================================

    let activeApiKey: string;
    let activeBaseUrl: string;
    let activeModelName: string;
    let activeUserId: number | null = null;

    // 1. 检查 X-Aura-Local-Key Header（客户端免登模式）
    const localKey = req.headers.get("x-aura-local-key");

    if (localKey) {
      // ===== 客户端模式：从请求 body 拿完整模型配置 =====
      const clientApiKey = body.apiKey ?? localKey;
      const clientBaseUrl =
        body.baseUrl ?? "https://api.deepseek.com/v1";
      const clientModelName = body.modelName ?? "deepseek-chat";

      if (!clientApiKey) {
        return Response.json(
          { code: 400, message: "客户端模式缺少 apiKey" },
          { status: 400 }
        );
      }

      activeApiKey = clientApiKey;
      activeBaseUrl = clientBaseUrl;
      activeModelName = clientModelName;
      // 客户端模式下 Key 用完即焚，不落库

      console.log("[Aura Chat] 客户端模式 (X-Aura-Local-Key)");
    } else {
      // ===== 服务端模式：JWT 鉴权 + 从 DB 查模型配置 =====
      const authPayload = await getAuthenticatedUser(req);
      if (!authPayload) {
        return Response.json(
          { code: 401, message: "请先登录" },
          { status: 401 }
        );
      }

      activeUserId = authPayload.userId;

      // 从 DB 查用户选定/默认的模型配置
      const config = await db.query.userModelConfigs.findFirst({
        where: and(
          eq(userModelConfigs.userId, authPayload.userId),
          selectedConfigId
            ? eq(userModelConfigs.id, selectedConfigId)
            : eq(userModelConfigs.isDefault, true)
        ),
      });

      if (!config) {
        // 如果没有配置，使用环境变量兜底
        activeApiKey = process.env.DEEPSEEK_API_KEY ?? "";
        activeBaseUrl =
          process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
        activeModelName = body.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

        if (!activeApiKey) {
          return Response.json(
            { code: 400, message: "未配置模型，请在系统设置中添加模型配置" },
            { status: 400 }
          );
        }
      } else {
        // 解密用户配置的 API Key
        activeApiKey = decrypt(config.apiKeyEncrypted);
        activeBaseUrl = config.baseUrl ?? "https://api.deepseek.com/v1";
        activeModelName = config.modelName;
      }

      console.log(
        `[Aura Chat] 服务端模式 (userId=${authPayload.userId}, model=${activeModelName})`
      );
    }

    // ============================================================
    // 2. 动态创建 DeepSeek provider 实例
    // ============================================================

    const customProvider = createDeepSeek({
      apiKey: activeApiKey,
      baseURL: activeBaseUrl,
    });

    // ============================================================
    // 3. 构建 system prompt（注入工作空间上下文）
    // ============================================================

    let systemPrompt =
      "你是 Aura，一个多场景通用智能体。你可以使用文件读写、Python 执行、联网搜索、HTTP 请求等工具来完成用户的任务。" +
      "当需要生成文件时，只输出结构化 JSON 数据，由 write_text_file 或 generate_structured_excel 工具来完成文件物化。" +
      "工具调用失败时，分析错误原因并尝试用其他方式完成任务，不要轻易放弃。";

    // 注入工作空间上下文
    if (workspaceId && activeUserId) {
      const wsPath = getWorkspaceRootForUser(activeUserId, workspaceId);
      systemPrompt += `\n当前工作空间路径: ${wsPath}。所有文件操作请以该路径为根目录。`;
    }

    // ============================================================
    // 4. 流式对话
    // ============================================================

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = streamText({
      model: customProvider(activeModelName),
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: auraTools as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maxSteps: maxSteps as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      experimental_repairToolCall: async (options: any) => {
        try {
          const repaired = await options.repairWithParameters;
          console.log("[Aura Chat] 工具调用修复:", repaired);
          return repaired;
        } catch {
          return { error: "无法修复工具调用参数" };
        }
      },

      // 工具执行完成/流结束时，持久化聊天记录
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onFinish: async (event: any) => {
        try {
          const { steps } = event;

          // 仅服务端模式 + 有 userId 时持久化到 PG
          if (!isServerMode() || !activeUserId) return;

          // 写入 user prompt
          if (prompt) {
            await db.insert(chatMessages).values([
              {
                sessionId,
                workspaceId: workspaceId || null,
                userId: activeUserId,
                role: "user",
                content: prompt,
              },
            ]);
          }

          // 写入 bot 响应
          const responseText =
            steps
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ?.map((step: any) => step.text)
              .filter(Boolean)
              .join("\n") ?? "";

          if (responseText) {
            await db.insert(chatMessages).values([
              {
                sessionId,
                workspaceId: workspaceId || null,
                userId: activeUserId,
                role: "assistant",
                content: responseText,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                toolCalls: steps?.map((s: any) => ({
                  toolName: s.toolName,
                  args: s.args,
                  result: s.result,
                })),
              },
            ]);
          }

          console.log(
            `[Aura Chat] 会话 ${sessionId} 已完成，持久化 ${steps?.length ?? 0} 步`
          );
        } catch (dbErr) {
          console.error("[Aura Chat] 会话持久化失败:", dbErr);
        }
      },

      onError: (event: { error: unknown }) => {
        console.error("【Agent 错误】", event.error);
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("【Route 异常】", error);
    return new Response(
      JSON.stringify({
        code: 500,
        message: error instanceof Error ? error.message : "内部服务错误",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
