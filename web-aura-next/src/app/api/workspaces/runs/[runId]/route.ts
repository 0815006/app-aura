import { db } from "@/lib/db/client";
import { workspaceRuns, runSteps } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { isServerMode } from "@/lib/env";
import { eq, asc } from "drizzle-orm";

/**
 * GET /api/workspaces/runs/[runId]
 *
 * 获取单次 Run 的完整详情（含所有 Steps 的时间线）。
 *
 * Response:
 * {
 *   code: 200,
 *   data: {
 *     run: { id, userPrompt, finalResponse, promptTokens, completionTokens, totalTokens, ... },
 *     steps: [{ stepNumber, stepType, thought, toolName, toolArgs, toolResult, durationMs }]
 *   }
 * }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  if (!isServerMode()) {
    return Response.json(
      { code: 400, message: "运行记录仅服务端模式可用" },
      { status: 400 }
    );
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { runId } = await params;

    if (!runId) {
      return Response.json(
        { code: 400, message: "缺少 runId 参数" },
        { status: 400 }
      );
    }

    // 查询 Run 基本信息
    const run = await db.query.workspaceRuns.findFirst({
      where: eq(workspaceRuns.id, runId),
    });

    if (!run) {
      return Response.json(
        { code: 404, message: "运行记录不存在" },
        { status: 404 }
      );
    }

    // 查询所有 Steps（按 stepNumber 正序）
    const steps = await db
      .select({
        stepNumber: runSteps.stepNumber,
        stepType: runSteps.stepType,
        thought: runSteps.thought,
        toolName: runSteps.toolName,
        toolArgs: runSteps.toolArgs,
        toolResult: runSteps.toolResult,
        durationMs: runSteps.durationMs,
        createTime: runSteps.createTime,
      })
      .from(runSteps)
      .where(eq(runSteps.runId, runId))
      .orderBy(asc(runSteps.stepNumber));

    return Response.json({
      code: 200,
      message: "success",
      data: {
        run: {
          id: run.id,
          sessionId: run.sessionId,
          userPrompt: run.userPrompt,
          finalResponse: run.finalResponse,
          promptTokens: run.promptTokens,
          completionTokens: run.completionTokens,
          totalTokens: run.totalTokens,
          finishReason: run.finishReason,
          modelName: run.modelName,
          status: run.status,
          createTime: run.createTime,
        },
        steps,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[runs/runId] 查询失败:", err);
    return Response.json(
      { code: 500, message: `获取运行详情失败: ${message}` },
      { status: 500 }
    );
  }
}
