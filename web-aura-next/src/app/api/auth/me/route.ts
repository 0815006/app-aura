/**
 * GET /api/auth/me
 *
 * 获取当前登录用户信息（用于页面刷新时恢复登录态）。
 *
 * Response:
 *   200 → { code: 200, message: "ok", data: { id, username, displayName } }
 *   401 → { code: 401, message: "未登录" }
 */
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const payload = await getAuthenticatedUser(req);
    if (!payload) {
      // 返回 HTTP 200 避免浏览器控制台报红（401 是预期行为：未登录用户访问页面）
      return Response.json({ code: 401, message: "未登录" });
    }

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return Response.json({ code: 401, message: "用户不存在" });
    }

    return Response.json({
      code: 200,
      message: "ok",
      data: user,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `获取用户信息失败: ${message}` },
      { status: 500 }
    );
  }
}
