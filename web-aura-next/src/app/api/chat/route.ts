import { createDeepSeek } from "@ai-sdk/deepseek";
import { streamText } from "ai";

import { db } from "@/lib/db/client";
import { chatMessages, userModelConfigs } from "@/lib/db/schema";
import { ensureDataDirs, isServerMode, getWorkspaceRootForUser } from "@/lib/env";
import { getAuthenticatedUser } from "@/lib/auth";
import { decrypt } from "@/lib/auth/crypto";
import { setToolContext, clearToolContext } from "@/lib/agent/tool-context";
import type { ToolContext } from "@/lib/agent/tool-context";
import { eq, and } from "drizzle-orm";

import {
  listDirectory,
  previewFileLines,
  readFileFull,
  createDirectory,
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
 */

// ============================================================
// 9 大原子工具注册表
// ============================================================

const auraTools = {
  // 一、文件与目录感知类
  listDirectory,
  previewFileLines,
  readFileFull,

  // 二、资产产出与修改类
  createDirectory,
  writeTextFile,
  generateStructuredExcel,

  // 三、动态计算与代码执行类
  executePythonCode,

  // 四、外部世界连接类
  webSearch,
  httpRequest,
};

// ============================================================
// ★ AI SDK v7 消息格式转换辅助函数
// ============================================================
// useChat (UI 层) 发送: { role, parts: [{ type, text }], id }
// streamText (Core 层) 需要: { role, content: string }
// 此处做 format normalization。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromUiMessage(msg: any): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("");
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMessages(msgs: any[]): any[] {
  return msgs.map((m) => {
    // 如果已有 content 字段（Core 格式），直接透传
    if (m.content !== undefined) {
      return { role: m.role, content: m.content };
    }
    // AI SDK v7 UI 格式：parts 数组 → content 字符串
    return { role: m.role, content: extractTextFromUiMessage(m) };
  });
}

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

    // ★ AI SDK v7: useChat 发送 body.messages = [{ role, parts, id }]
    // 必须转换为 streamText 需要的 [{ role, content }] 格式
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawMessages: any[] = Array.isArray(body.messages) ? body.messages : [];

    // 提取最后一条用户消息的纯文本（用于日志和持久化）
    let prompt = "";
    if (rawMessages.length > 0) {
      prompt = extractTextFromUiMessage(rawMessages[rawMessages.length - 1]);
    }
    if (!prompt && body.prompt) {
      prompt = body.prompt;
    }

    // 消息格式标准化：UI parts → Core content
    const aiMessages: any[] = rawMessages.length > 0
      ? normalizeMessages(rawMessages)
      : prompt
        ? [{ role: "user", content: prompt }]
        : [];

    const sessionId: string = body.sessionId ?? body.chatId ?? "default";
    const workspaceId: string | null = body.workspaceId ?? null;
    const selectedConfigId: string | null = body.modelConfigId ?? null;

    // ReAct 最大工具调用步数（防止无限循环消耗 Token）
    const maxSteps: number = body.maxSteps ?? 15;

    console.log(
      `[Aura Chat] ${rawMessages.length} 条消息, prompt: "${prompt.slice(0, 80)}"`
    );

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

      console.log("[Aura Chat] 客户端模式 (X-Aura-Local-Key)");
    } else {
      const authPayload = await getAuthenticatedUser(req);
      if (!authPayload) {
        return Response.json(
          { code: 401, message: "请先登录" },
          { status: 401 }
        );
      }

      activeUserId = authPayload.userId;

      const config = await db.query.userModelConfigs.findFirst({
        where: and(
          eq(userModelConfigs.userId, authPayload.userId),
          selectedConfigId
            ? eq(userModelConfigs.id, selectedConfigId)
            : eq(userModelConfigs.isDefault, true)
        ),
      });

      if (!config) {
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
    // 3. 构建 system prompt
    // ============================================================

    let systemPrompt =
      "你是 Aura Agent。用户消息 = 命令，必须立即调工具，禁止先输出文字。" +
      "工具: create_directory, write_text_file(自动建父目录), list_directory, read_file_full, preview_file_lines, web_search, http_request, execute_python_code, generate_structured_excel。" +
      "路径: 根目录='.'。示例: create_directory('docs') → write_text_file('docs/f.md','内容')。";

    // 注入工作空间上下文
    if (workspaceId && activeUserId) {
      const wsPath = getWorkspaceRootForUser(activeUserId, workspaceId);
      systemPrompt +=
        `\n\n【当前工作空间】${wsPath}`;
    }

    // ============================================================
    // 4. 流式对话
    // ============================================================

    // ★ 注入 workspace 上下文到所有工具
    // 工具通过 runWithContext().workspaceId 感知到当前 workspace
    const toolCtx: ToolContext = {
      userId: activeUserId,
      workspaceId,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runWithContext(toolCtx, () => streamText({
      model: customProvider(activeModelName),
      system: systemPrompt,
      messages: aiMessages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: auraTools as any,
      // ★ 强制模型优先选择工具调用（而非输出文字）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolChoice: "auto" as any,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onFinish: async (event: any) => {
        try {
          const { steps, finishReason } = event;

          // ★ 诊断日志
          console.log(
            `[Aura Chat] onFinish: finishReason=${finishReason}, stepCount=${steps?.length ?? 0}`
          );
          if (steps && Array.isArray(steps)) {
            steps.forEach((s: any, i: number) => {
              const tc = s.toolCalls?.[0];
              const tr = s.toolResults?.[0];
              const trPreview = tr ? JSON.stringify(tr).slice(0, 200) : "N/A";
              console.log(
                `[Aura Chat] Step[${i}]: type=${s.stepType ?? "?"}, text=${(s.text ?? "").slice(0, 80)}, toolName=${tc?.toolName ?? "N/A"}, toolResult=${trPreview}`
              );
            });
          }

          if (!isServerMode() || !activeUserId) return;

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
        } catch (dbErr) {
          console.error("[Aura Chat] 会话持久化失败:", dbErr);
        }
      },

      onError: (event: { error: unknown }) => {
        console.error("【Agent 错误】", event.error);
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));

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
