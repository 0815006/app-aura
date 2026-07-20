import { db } from "@/lib/db/client";
import { chatMessages } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { eq, and, asc } from "drizzle-orm";

/**
 * GET /api/workspaces/chat-messages?workspaceId=xxx&sessionId=xxx
 *
 * 加载指定工作空间下某个会话的全部历史消息（按时间正序）。
 * 用于用户点击「最近任务」卡片后恢复完整对话上下文。
 *
 * Query 参数：
 * - workspaceId (必填): 工作空间 UUID
 * - sessionId (必填): 会话 ID
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
    const sessionId = searchParams.get("sessionId");

    if (!workspaceId) {
      return Response.json(
        { code: 400, message: "缺少 workspaceId 参数" },
        { status: 400 }
      );
    }

    if (!sessionId) {
      return Response.json(
        { code: 400, message: "缺少 sessionId 参数" },
        { status: 400 }
      );
    }

    const rows = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        toolCalls: chatMessages.toolCalls,
        createTime: chatMessages.createTime,
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.workspaceId, workspaceId),
          eq(chatMessages.sessionId, sessionId),
          eq(chatMessages.userId, auth.userId)
        )
      )
      .orderBy(asc(chatMessages.createTime));

    return Response.json({
      code: 200,
      message: "success",
      data: rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[chat-messages] 查询失败:", err);
    return Response.json(
      { code: 500, message: `获取历史消息失败: ${message}` },
      { status: 500 }
    );
  }
}
