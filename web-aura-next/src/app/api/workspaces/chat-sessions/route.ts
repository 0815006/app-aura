import { db } from "@/lib/db/client";
import { getAuthenticatedUser } from "@/lib/auth";
import { sql } from "drizzle-orm";

/**
 * GET /api/workspaces/chat-sessions?workspaceId=xxx&limit=3
 *
 * 获取指定工作空间下最近 N 次会话摘要。
 * 会话汇总字段：
 * - sessionId: 会话 ID
 * - firstUserMessage: 该会话第一条用户消息（作为标题）
 * - messageCount: 消息总数
 * - lastActivity: 最后一次消息时间
 *
 * Query 参数：
 * - workspaceId (必填): 工作空间 UUID
 * - limit (可选，默认 3): 返回最近 N 条会话
 * - all (可选): 任意真值则返回所有会话（limit 失效）
 */
export async function GET(req: Request) {
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
    const all = searchParams.get("all");
    const limit = all ? undefined : Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? "3", 10)),
      50
    );

    if (!workspaceId) {
      return Response.json(
        { code: 400, message: "缺少 workspaceId 参数" },
        { status: 400 }
      );
    }

    // ★ 使用子查询：按 session_id 分组，取每组最早用户消息 + 最新时间 + 消息数
    // 聚合后排序，取前 N 条
    const result = await db.execute(
      sql`
        SELECT
          cm.session_id,
          (
            SELECT cm2.content
            FROM chat_messages cm2
            WHERE cm2.session_id = cm.session_id
              AND cm2.role = 'user'
              AND cm2.workspace_id = ${workspaceId}::uuid
              AND cm2.user_id = ${auth.userId}
            ORDER BY cm2.create_time ASC
            LIMIT 1
          ) AS first_user_message,
          COUNT(*)::int AS message_count,
          MAX(cm.create_time) AS last_activity
        FROM chat_messages cm
        WHERE cm.workspace_id = ${workspaceId}::uuid
          AND cm.user_id = ${auth.userId}
        GROUP BY cm.session_id
        ORDER BY MAX(cm.create_time) DESC
        ${limit != null ? sql`LIMIT ${limit}` : sql``}
      `
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = result.rows as any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions = rows.map((row: any) => ({
      sessionId: row.session_id,
      title: row.first_user_message
        ? String(row.first_user_message).slice(0, 60)
        : "（空对话）",
      messageCount: parseInt(String(row.message_count ?? "0"), 10),
      lastActivity: row.last_activity,
    }));

    return Response.json({
      code: 200,
      message: "success",
      data: sessions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[chat-sessions] 查询失败:", err);
    return Response.json(
      { code: 500, message: `获取会话列表失败: ${message}` },
      { status: 500 }
    );
  }
}
