/**
 * POST /api/auth/register
 *
 * 注册接口：开放注册，无需管理员审批。
 * 注册成功后自动创建 DATA_ROOT/workspaces/user_{id}/ 个人目录。
 *
 * Body: { username: string, password: string, displayName?: string }
 * Response:
 *   200 → { code: 200, message: "注册成功", data: { token, user } }
 *   409 → { code: 409, message: "用户名已存在" }
 */
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  signJWT,
  serializeCookie,
  AUTH_COOKIE_NAME,
} from "@/lib/auth";
import { getDataRoot } from "@/lib/env";
import path from "path";
import fs from "fs";

export async function POST(req: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const displayName = body.displayName
      ? String(body.displayName).trim()
      : undefined;

    // 校验
    if (!username || !password) {
      return Response.json(
        { code: 400, message: "用户名和密码不能为空" },
        { status: 400 }
      );
    }

    if (username.length < 2 || username.length > 100) {
      return Response.json(
        { code: 400, message: "用户名长度必须在 2-100 之间" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { code: 400, message: "密码长度至少 6 位" },
        { status: 400 }
      );
    }

    // 检查用户名唯一
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existing) {
      return Response.json(
        { code: 409, message: "用户名已存在" },
        { status: 409 }
      );
    }

    // 哈希密码并插入
    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        displayName: displayName || null,
      })
      .returning();

    // 自动创建工作空间目录
    const dataRoot = getDataRoot();
    if (dataRoot) {
      const userDir = path.join(dataRoot, "workspaces", `user_${newUser.id}`);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
        console.log(`📁 [Auth Register] 已创建用户工作空间目录: ${userDir}`);
      }
    }

    // 签发 JWT
    const token = await signJWT({
      userId: newUser.id,
      username: newUser.username,
    });

    const response = Response.json({
      code: 200,
      message: "注册成功",
      data: {
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          displayName: newUser.displayName,
        },
      },
    });

    // 设置 Cookie
    response.headers.set(
      "Set-Cookie",
      serializeCookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      })
    );

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Auth Register] 注册失败:", message);
    return Response.json(
      { code: 500, message: `注册失败: ${message}` },
      { status: 500 }
    );
  }
}
