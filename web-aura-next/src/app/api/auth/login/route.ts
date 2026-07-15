/**
 * POST /api/auth/login
 *
 * 登录接口：验证用户名密码，签发 JWT，设置 Cookie。
 *
 * Body: { username: string, password: string }
 * Response:
 *   200 → { code: 200, message: "ok", data: { token, user: { id, username, displayName } } }
 *   401 → { code: 401, message: "用户名或密码错误" }
 */
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  signJWT,
  serializeCookie,
  AUTH_COOKIE_NAME,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username || !password) {
      return Response.json(
        { code: 400, message: "用户名和密码不能为空" },
        { status: 400 }
      );
    }

    // 查用户
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      return Response.json(
        { code: 401, message: "用户名或密码错误" },
        { status: 401 }
      );
    }

    // 验证密码
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return Response.json(
        { code: 401, message: "用户名或密码错误" },
        { status: 401 }
      );
    }

    // 签发 JWT
    const token = await signJWT({
      userId: user.id,
      username: user.username,
    });

    // 构建响应
    const response = Response.json({
      code: 200,
      message: "ok",
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
        },
      },
    });

    // 设置 HttpOnly Cookie（服务端鉴权用）
    response.headers.set(
      "Set-Cookie",
      serializeCookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 7天
      })
    );

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Auth Login] 登录失败:", message);
    return Response.json(
      { code: 500, message: `登录失败: ${message}` },
      { status: 500 }
    );
  }
}
