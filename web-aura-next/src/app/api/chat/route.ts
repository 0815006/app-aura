import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod/v4";

/**
 * Aura 智能体核心路由
 * 所有与大模型交互的请求统一走此入口，使用流式响应 (streamText)。
 *
 * 规范要点：
 * - 流式优先：使用 streamText 而非 generateText
 * - 工具异常隔离：Tool 失败绝不导致主 Chat 流中断
 * - 超时熔断：调用外部系统显式设置 Timeout（默认 10 秒）
 */

// 初始化 DeepSeek 客户端（兼容 OpenAI 协议）
const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL,
});

/** 工具执行超时包装（规范 2.1：超时熔断机制，默认 10 秒） */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10_000,
  toolName: string = "unknown"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[${toolName}] 执行超时 (${timeoutMs}ms)`)),
        timeoutMs
      )
    ),
  ]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = streamText({
      model: deepseek("deepseek-reasoner"),
      prompt: (body as { prompt?: string }).prompt ?? "Hello",

      // 注册工具 — 90% 的核心精力投入于此
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: {
        getExplainPlan: tool({
          description:
            "当用户需要分析 SQL 语句的执行计划时调用此工具。传入完整的 SQL 语句，返回模拟的执行计划结果。",
          parameters: z.object({
            sql: z.string().describe("需要分析的完整 SQL 语句"),
          }),
          // AI SDK v7 工具执行器，含完整 Try-Catch 隔离 + 超时熔断
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          execute: async (input: any): Promise<string> => {
            try {
              const sql = String(input?.sql ?? "");
              console.log(`[Tool:getExplainPlan] 正在分析 SQL: ${sql}`);

              const result = await withTimeout(
                (async () => {
                  // === 模拟 DBA 胶水层逻辑 ===
                  // 实际场景：通过 pg 驱动连库执行 EXPLAIN，或 SSH 远程执行脚本
                  if (sql.toLowerCase().includes("user")) {
                    return JSON.stringify({
                      plan: "Index Scan using idx_user_id on users (cost=0.42..8.44 rows=1)",
                      status: "success",
                    });
                  }
                  return JSON.stringify({
                    plan: "Seq Scan on large_table (cost=0.00..15423.10 rows=500000)",
                    warning: "⚠️ 全表扫描风险！建议添加索引。",
                    status: "warning",
                  });
                })(),
                10_000,
                "getExplainPlan"
              );

              return result;
            } catch (err) {
              // 规范 2.1：工具失败绝不中断主 Chat 流
              const errorMessage =
                err instanceof Error ? err.message : "未知错误";
              console.error(`[Tool:getExplainPlan] 执行失败:`, errorMessage);
              return JSON.stringify({
                error: "Prometheus 连接超时",
                detail: errorMessage,
              });
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
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
