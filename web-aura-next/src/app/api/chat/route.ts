import { createDeepSeek } from "@ai-sdk/deepseek";
import { streamText, stepCountIs } from "ai";

import { db } from "@/lib/db/client";
import {
  chatMessages,
  userModelConfigs,
  workspaceRuns,
  runSteps,
  workspaceMemories,
  sceneDefinitions,
  dbConnections,
  workspaces,
} from "@/lib/db/schema";
import { ensureDataDirs, isServerMode, getWorkspaceRootForUser } from "@/lib/env";
import { getAuthenticatedUser } from "@/lib/auth";
import { decrypt } from "@/lib/auth/crypto";
import { setToolContext, clearToolContext } from "@/lib/agent/tool-context";
import type { ToolContext } from "@/lib/agent/tool-context";
import { extractAndSaveMemories } from "@/lib/agent/memory-extractor";
import { eq, and, desc, gte } from "drizzle-orm";

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
  updateMemory,
  // UI 专项工具
  executePlaywrightValidation,
  saveUiAuditReport,
  // DB 专项工具
  dbExecuteQuery,
  dbGetQueryPlan,
  dbGetTableSchema,
  dbListSlowQueries,
  releaseAllPools,
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

  // 五、工作空间记忆管理
  updateMemory,
};

// 场景专属 DB 工具集
const sceneDbTools = {
  dbExecuteQuery,
  dbGetQueryPlan,
  dbGetTableSchema,
  dbListSlowQueries,
};

// 场景专属 UI 工具集（UI 原型契约与自动化校验专家）
const sceneUiTools = {
  executePlaywrightValidation,
  saveUiAuditReport,
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

    // ★ 场景与数据库连接
    const sceneSlug: string | null = body.sceneSlug ?? null;
    const dbConnectionId: string | null = body.dbConnectionId ?? null;

    // ReAct 最大工具调用步数（防止无限循环消耗 Token）
    // ★ 配额熔断：maxSteps 硬上限 20 步，前端传入超过此值自动截断
    const MAX_STEPS_HARD = parseInt(process.env.AURA_MAX_STEPS_HARD ?? "20", 10);
    const maxSteps: number = Math.min(body.maxSteps ?? 15, MAX_STEPS_HARD);

    console.log(
      `[Aura Chat] ${rawMessages.length} 条消息, prompt: "${prompt.slice(0, 80)}", workspaceId=${workspaceId ?? "(无)"}`
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
    // ★ 配额熔断：每日 Token 消耗检查
    // ============================================================

    const DEFAULT_TOKEN_LIMIT = parseInt(
      process.env.AURA_DAILY_TOKEN_LIMIT ?? "500000",
      10
    );
    let dailyUsageRatio = 0;
    let effectiveDailyLimit = DEFAULT_TOKEN_LIMIT;

    if (workspaceId) {
      try {
        // 读取工作空间自定义配额（如有）
        const ws = await db.query.workspaces.findFirst({
          where: eq(workspaces.id, workspaceId),
          columns: { dailyTokenLimit: true },
        });
        if (ws?.dailyTokenLimit != null && ws.dailyTokenLimit > 0) {
          effectiveDailyLimit = ws.dailyTokenLimit;
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayRuns = await db.query.workspaceRuns.findMany({
          where: and(
            eq(workspaceRuns.workspaceId, workspaceId),
            gte(workspaceRuns.createTime, todayStart)
          ),
          columns: { totalTokens: true },
        });

        const todayTotal = todayRuns.reduce(
          (sum, r) => sum + (r.totalTokens ?? 0),
          0
        );
        dailyUsageRatio = todayTotal / effectiveDailyLimit;

        console.log(
          `[Aura Chat] 今日 Token: ${todayTotal.toLocaleString()} / ${effectiveDailyLimit.toLocaleString()} (${Math.round(dailyUsageRatio * 100)}%)` +
          (ws?.dailyTokenLimit ? " [工作空间自定义]" : " [全局默认]")
        );

        // 100%：硬阻断
        if (todayTotal >= effectiveDailyLimit) {
          return Response.json(
            {
              code: 429,
              message: `今日 Token 配额已用尽（${effectiveDailyLimit.toLocaleString()}）。你可以增加工作空间配额后继续使用，或等待明天自动重置。`,
              quota: {
                limit: effectiveDailyLimit,
                used: todayTotal,
                remaining: 0,
              },
            },
            { status: 429 }
          );
        }
      } catch (quotaErr) {
        // 配额检查失败时不阻塞正常请求（fail-open）
        console.error("[Aura Chat] 配额检查失败（放行）:", quotaErr);
      }
    }

    // ============================================================
    // 3. 构建 system prompt
    // ============================================================

    let systemPrompt =
      "你是 Aura Agent，一个智能体工作台助手。\n\n" +
      "★★★ 最重要的规则（违反将导致任务失败）★★★\n" +
      "你必须通过调用工具来完成任务。不能只描述你要做什么 — 你必须实际调用工具。\n" +
      "每当你想要说「我来创建...」或「我先看看...」时，改为直接调用对应的工具。\n" +
      "你可以在调用工具的同时附上一句简短说明，但绝不能只输出说明而不调用工具。\n\n" +
      "核心规则：\n" +
      "1. 收到用户请求后，立即调用工具开始执行。第一轮对话就要产出工具调用。\n" +
      "2. 每次工具返回结果后，解读结果并继续调用下一个工具，直到任务完成。\n" +
      "3. 所有任务完成后，给出总结性回复。\n" +
      "4. 使用中文回复。\n\n" +
      "可用工具及参数名:\n" +
      "- write_text_file({ file_path, content }) — 写文件，自动建父目录\n" +
      "- create_directory({ dir_path }) — 创建目录\n" +
      "- list_directory({ dir_path }) — 列出目录内容\n" +
      "- read_file_full({ file_path }) — 读取完整文件\n" +
      "- preview_file_lines({ file_path, lines? }) — 预览文件前N行\n" +
      "- web_search, http_request, execute_python_code, generate_structured_excel, update_memory\n\n" +
      "路径: 所有 file_path/dir_path 均相对于工作空间根目录。\n" +
      "示例: write_text_file({ file_path: 'HelloWorld.java', content: '...' })\n\n" +
      "反面示例（绝对禁止）: 只输出「我来创建一个Vue项目，先看看目录结构」然后停止 — 这是错误的！你必须实际调用 list_directory 和 write_text_file。";

    // 注入工作空间上下文
    if (workspaceId && activeUserId) {
      const wsPath = getWorkspaceRootForUser(activeUserId, workspaceId);
      systemPrompt +=
        `\n\n【当前工作空间】${wsPath}\n所有文件操作（create_directory / write_text_file / list_directory / read_file_full / preview_file_lines）都基于此工作空间根目录。你输入 'docs' 会自动解析为 ${wsPath}/docs。`;
      console.log(`[Aura Chat] 工作空间上下文已注入: ${wsPath}`);
    } else {
      console.log(
        `[Aura Chat] ⚠️ 未注入工作空间上下文 (workspaceId=${workspaceId}, userId=${activeUserId})`
      );
    }

    // ★ 注入工作空间长期记忆
    if (workspaceId) {
      try {
        const memories = await db.query.workspaceMemories.findMany({
          where: eq(workspaceMemories.workspaceId, workspaceId),
          orderBy: desc(workspaceMemories.importance),
          limit: 20,
        });

        if (memories.length > 0) {
          const memoryLines = memories.map(
            (m) =>
              `- [${m.category}] **${m.key}**: ${m.content.slice(0, 300)}`
          );
          systemPrompt +=
            `\n\n【工作空间长期记忆】以下是从历史对话中积累的关于本项目的关键信息，请在决策时参考：\n${memoryLines.join("\n")}`;
          console.log(
            `[Aura Chat] 已注入 ${memories.length} 条工作空间记忆`
          );
        }
      } catch (memErr) {
        console.error("[Aura Chat] 加载工作空间记忆失败:", memErr);
      }
    }

    // ============================================================
    // ★ 场景感知：加载场景配置 + DB 连接信息
    // ============================================================

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sceneConfig: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbConnConfig: any = null;
    let hasDbTools = false;
    let hasUiTools = false;

    if (sceneSlug) {
      try {
        sceneConfig = await db.query.sceneDefinitions.findFirst({
          where: and(
            eq(sceneDefinitions.slug, sceneSlug),
            eq(sceneDefinitions.status, "active")
          ),
        });

        if (!sceneConfig) {
          console.warn(`[Aura Chat] ⚠️ 场景不存在或已停用: ${sceneSlug}`);
        } else {
          // 追加场景 System Prompt
          systemPrompt +=
            `\n\n【当前场景】${sceneConfig.name}\n\n【场景规则】\n${sceneConfig.systemPrompt}`;

          // 如果场景需要数据库连接
          if (sceneConfig.dbRequired && dbConnectionId) {
            try {
              dbConnConfig = await db.query.dbConnections.findFirst({
                where: and(
                  eq(dbConnections.id, dbConnectionId),
                  eq(dbConnections.status, "active")
                ),
              });

              if (dbConnConfig) {
                // 注入 DB 连接信息到 System Prompt
                systemPrompt +=
                  `\n\n【数据库连接信息】\n- 类型: ${dbConnConfig.dbType === "postgresql" ? "PostgreSQL" : "MySQL"}\n` +
                  `- 主机: ${dbConnConfig.host}:${dbConnConfig.port}\n` +
                  `- 数据库: ${dbConnConfig.dbName}\n` +
                  `- 用户: ${dbConnConfig.username}\n` +
                  `（密码已加密，你通过 db_* 工具透明使用该连接即可，无需处理凭证）`;

                hasDbTools = true;
                console.log(
                  `[Aura Chat] 场景 "${sceneConfig.name}" + DB 连接 "${dbConnConfig.label}" 已就绪`
                );
              } else {
                console.warn(
                  `[Aura Chat] ⚠️ 场景要求 DB 连接，但指定的连接 ${dbConnectionId} 不存在`
                );
              }
            } catch (dbErr) {
              console.error("[Aura Chat] 加载 DB 连接失败:", dbErr);
            }
          }

          console.log(`[Aura Chat] 场景已加载: ${sceneConfig.name} (slug=${sceneSlug})`);

          // 如果场景是 UI 原型契约校验专家，挂载 UI 专属工具
          if (sceneSlug === "bank-ui-validator") {
            hasUiTools = true;
            console.log(
              `[Aura Chat] UI 校验场景 — 已挂载 Playwright + 审计报告工具`
            );
          }
        }
      } catch (sceneErr) {
        console.error("[Aura Chat] 加载场景失败:", sceneErr);
      }
    }

    // ★ 配额提醒：用量超 80% 时注入 System Prompt，让 AI 自动精简
    if (dailyUsageRatio >= 0.95) {
      const remaining = effectiveDailyLimit * (1 - dailyUsageRatio);
      systemPrompt +=
        `\n\n⚠️⚠️⚠️ 【Token 配额紧急警告】今日配额已使用 ${Math.round(dailyUsageRatio * 100)}%，仅剩 ${Math.round(remaining).toLocaleString()} tokens。请极度精简回复，跳过非必要步骤，直接给出关键结论。`;
    } else if (dailyUsageRatio >= 0.8) {
      const remaining = effectiveDailyLimit * (1 - dailyUsageRatio);
      systemPrompt +=
        `\n\n⚠️ 【Token 配额提醒】今日配额已使用 ${Math.round(dailyUsageRatio * 100)}%，剩余 ${Math.round(remaining).toLocaleString()} tokens。请精简回复，减少不必要的探索性工具调用。`;
    }

    // ============================================================
    // 4. 流式对话
    // ============================================================

    // ★ 注入 workspace 上下文到所有工具 (globalThis 方式)
    const toolCtx: ToolContext = {
      userId: activeUserId,
      workspaceId,
      sceneSlug: sceneSlug ?? undefined,
      dbConnectionId: dbConnectionId ?? undefined,
    };
    setToolContext(toolCtx);

    // ★ 动态工具挂载：按场景类型合并专属工具
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activeTools: any = auraTools;
    if (hasDbTools) {
      activeTools = { ...activeTools, ...sceneDbTools };
    }
    if (hasUiTools) {
      activeTools = { ...activeTools, ...sceneUiTools };
    }

    // ★ 步骤计时器 & 用量追踪（跨 onStepFinish / onFinish 共享）
    let stepStartTime = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stepTimings: Array<{ stepNumber: number; durationMs: number; stepUsage: any }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = streamText({
      model: customProvider(activeModelName),
      // ★ 禁用 DeepSeek 思考模式：防止模型在 reasoning 阶段空转后
      // 以 finishReason="stop" 结束而不实际调用工具
      // AI SDK v7: providerOptions 代替 model() 的第二个参数
      providerOptions: {
        deepseek: {
          thinking: { type: "disabled" as const },
        },
      },
      system: systemPrompt,
      messages: aiMessages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: activeTools as any,
      // ★ 自动选择：模型自主决定何时调用工具、何时输出文字
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolChoice: "auto" as any,
      // ★ AI SDK v7: 用 stopWhen 控制多步工具调用（maxSteps 在 v7 中不存在！）
      // 默认是 stepCountIs(1)，必须显式设置才能执行多步
      stopWhen: stepCountIs(maxSteps),
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

      // ★ onStepFinish: 每步完成时记录耗时 + Token 用量
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onStepFinish: async (event: any) => {
        const now = Date.now();
        const durationMs = now - stepStartTime;
        stepStartTime = now; // 下一步的起点

        const { stepNumber, stepType, text, toolCalls, toolResults, usage: stepUsage } = event;

        // 保存计时数据供 onFinish 持久化
        stepTimings.push({ stepNumber, durationMs, stepUsage });

        const usageStr = stepUsage
          ? `prompt=${stepUsage.promptTokens ?? 0} completion=${stepUsage.completionTokens ?? 0} total=${stepUsage.totalTokens ?? 0}`
          : "N/A";

        const tcSummary =
          toolCalls
            ?.map((tc: any) => tc.toolName)
            .join(", ") || "—";

        console.log(
          `[Aura Chat] ✅ Step #${stepNumber} [${stepType}] · ${durationMs}ms · 🔧 ${tcSummary} · 📊 ${usageStr}`
        );
        if (text) {
          console.log(`[Aura Chat]    💬 "${text.slice(0, 120)}"`);
        }
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onFinish: async (event: any) => {
        // ★ 释放 DB 连接池（必须在清理上下文之前）
        if (hasDbTools) {
          releaseAllPools().catch((err) => {
            console.error("[Aura Chat] 释放 DB 连接池失败:", err);
          });
        }

        // ★ 工具执行完毕后清理上下文
        clearToolContext();

        try {
          const { steps, finishReason, usage } = event;

          // ★ 诊断日志
          console.log(
            `[Aura Chat] 🏁 onFinish: finishReason=${finishReason}, stepCount=${steps?.length ?? 0}, totalTokens=${usage?.totalTokens ?? 0}`
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

          if (!activeUserId) return;

          // ============================================================
          // 1. 持久化 chatMessages（原有逻辑）
          // ============================================================

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

          // ★ 从 steps 中提取完整的工具调用数据（含参数和结果）
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allToolCalls: any[] = [];
          if (steps && Array.isArray(steps)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const step of steps as any[]) {
              if (step.toolCalls && Array.isArray(step.toolCalls)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const tc of step.toolCalls as any[]) {
                  // 匹配同一步骤中的工具结果
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const matchingResult = step.toolResults?.find(
                    (tr: any) => tr.toolName === tc.toolName
                  );
                  allToolCalls.push({
                    toolName: tc.toolName ?? "unknown",
                    args: tc.args ?? {},
                    result: matchingResult?.result ?? null,
                  });
                }
              }
            }
          }

          if (responseText || allToolCalls.length > 0) {
            await db.insert(chatMessages).values([
              {
                sessionId,
                workspaceId: workspaceId || null,
                userId: activeUserId,
                role: "assistant",
                content: responseText || "(工具执行完成)",
                toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
              },
            ]);
          }

          // ============================================================
          // 2. ★ 新增：持久化 Run 记录
          // ============================================================

          if (!workspaceId) {
            console.log("[Aura Chat] 无 workspaceId，跳过 Run 持久化");
            return;
          }

          // 生成 toolSummary 供记忆提取使用
          const toolResultsForMemory: string[] = [];

          // 2.1 插入 workspace_runs
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [insertedRun] = await db
            .insert(workspaceRuns)
            .values({
              workspaceId,
              userId: activeUserId,
              sessionId,
              userPrompt: prompt,
              finalResponse: responseText || null,
              promptTokens: usage?.promptTokens ?? 0,
              completionTokens: usage?.completionTokens ?? 0,
              totalTokens: usage?.totalTokens ?? 0,
              finishReason: finishReason ?? "stop",
              modelName: activeModelName,
              status: "completed",
            })
            .returning({ id: workspaceRuns.id });

          const runId = insertedRun?.id;
          if (!runId) {
            console.error("[Aura Chat] Run 记录插入失败，跳过 Step 持久化");
            return;
          }

          console.log(`[Aura Chat] Run 已持久化: ${runId}`);

          // 2.2 插入 run_steps（遍历每个 step，含耗时 & 用量）
          if (steps && Array.isArray(steps)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (let i = 0; i < steps.length; i++) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const step: any = steps[i];
              const now = new Date();

              // ★ 从 onStepFinish 收集的计时数据中查找匹配的 step
              const timing = stepTimings.find((t) => t.stepNumber === i + 1);
              const durationMs = timing?.durationMs ?? null;
              const stepUsage = timing?.stepUsage ?? null;

              // a. 如果有思考文本
              const thoughtText: string =
                typeof step.text === "string" ? step.text : "";
              const hasText = thoughtText.trim().length > 0;

              if (hasText) {
                await db.insert(runSteps).values({
                  runId,
                  stepNumber: i + 1,
                  stepType: "thought",
                  thought: thoughtText,
                  durationMs,
                  createTime: now,
                });
              }

              // b. 工具调用
              if (
                step.toolCalls &&
                Array.isArray(step.toolCalls) &&
                step.toolCalls.length > 0
              ) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const tc of step.toolCalls as any[]) {
                  await db.insert(runSteps).values({
                    runId,
                    stepNumber: i + 1,
                    stepType: "tool-call",
                    toolName: tc.toolName ?? "unknown",
                    toolArgs: tc.args ?? null,
                    durationMs,
                    createTime: now,
                  });

                  // 收集工具结果用于记忆提取
                  if (tc.toolName && tc.args) {
                    toolResultsForMemory.push(
                      `${tc.toolName}(${JSON.stringify(tc.args).slice(0, 200)})`
                    );
                  }
                }
              }

              // c. 工具结果
              if (
                step.toolResults &&
                Array.isArray(step.toolResults) &&
                step.toolResults.length > 0
              ) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const tr of step.toolResults as any[]) {
                  await db.insert(runSteps).values({
                    runId,
                    stepNumber: i + 1,
                    stepType: "tool-result",
                    toolName: tr.toolName ?? "unknown",
                    toolResult:
                      typeof tr.result === "string"
                        ? { output: tr.result }
                        : (tr.result ?? null),
                    durationMs,
                    createTime: now,
                  });
                }
              }
            }
          }

          // ============================================================
          // 3. ★ 新增：触发记忆自动提取（fire-and-forget）
          // ============================================================

          if (workspaceId && prompt && responseText) {
            extractAndSaveMemories({
              workspaceId,
              runId,
              userPrompt: prompt,
              finalResponse: responseText,
              toolSummary: toolResultsForMemory.join("; "),
              apiKey: activeApiKey,
              baseUrl: activeBaseUrl,
              modelName: activeModelName,
            }).catch((extractErr) => {
              console.error("[Aura Chat] 记忆提取异常:", extractErr);
            });
          }
        } catch (dbErr) {
          console.error("[Aura Chat] 会话持久化失败:", dbErr);
        }
      },

      onError: (event: { error: unknown }) => {
        console.error("【Agent 错误】", event.error);
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const response = result.toUIMessageStreamResponse();
    // ★ clearToolContext 必须在 onFinish 中调用，不能在返回 response 后立即调用。
    // 原因：streamText 同步返回 stream 对象，但工具执行发生在客户端消费流数据的过程中。
    // 如果在 toUIMessageStreamResponse 后立即清理 globalThis，工具执行时上下文丢失，
    // resolveWorkspaceAwarePath 回退到 resolveSafePath → 写到 DATA_ROOT/ 而非 workspace。
    return response;
  } catch (error) {
    clearToolContext();
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
