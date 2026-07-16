import { db } from "@/lib/db/client";
import { workspaceRuns } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { isServerMode } from "@/lib/env";
import { eq, desc, and, SQL } from "drizzle-orm";

/**
 * GET /api/workspaces/runs?workspaceId=xxx&sessionId=xxx&limit=20&offset=0
 *
 * 获取指定工作空间下的所有 Run 列表（分页）。
 * 可选的 sessionId 用于筛选特定会话的 Run。
 * 返回每次 Agent 任务的摘要信息（含 token 用量、模型、状态）。
 *
 * Query 参数：
 * - workspaceId (必填): 工作空间 UUID
 * - sessionId (可选): 按会话 ID 过滤
 * - limit (可选，默认 20，最大 50): 每页条数
 * - offset (可选，默认 0): 分页偏移
 */
export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const sessionId = searchParams.get("sessionId");
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
      50
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get("offset") ?? "0", 10)
    );

    if (!workspaceId) {
      return Response.json(
        { code: 400, message: "缺少 workspaceId 参数" },
        { status: 400 }
      );
    }

    // 构建 WHERE 条件
    const conditions: SQL[] = [eq(workspaceRuns.workspaceId, workspaceId)];
    if (sessionId) {
      conditions.push(eq(workspaceRuns.sessionId, sessionId));
    }

    const rows = await db
      .select({
        id: workspaceRuns.id,
        sessionId: workspaceRuns.sessionId,
        userPrompt: workspaceRuns.userPrompt,
        totalTokens: workspaceRuns.totalTokens,
        promptTokens: workspaceRuns.promptTokens,
        completionTokens: workspaceRuns.completionTokens,
        finishReason: workspaceRuns.finishReason,
        modelName: workspaceRuns.modelName,
        status: workspaceRuns.status,
        createTime: workspaceRuns.createTime,
      })
      .from(workspaceRuns)
      .where(and(...conditions))
      .orderBy(desc(workspaceRuns.createTime))
      .limit(limit)
      .offset(offset);

    // 查询总数（简化实现：不单独 count，前端按需加载更多）
    return Response.json({
      code: 200,
      message: "success",
      data: {
        runs: rows,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[runs] 查询失败:", err);
    return Response.json(
      { code: 500, message: `获取运行记录失败: ${message}` },
      { status: 500 }
    );
  }
}
