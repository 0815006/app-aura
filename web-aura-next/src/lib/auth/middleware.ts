/**
 * Aura API 鉴权中间件
 *
 * 服务端 API 在执行业务逻辑前调用此中间件，获取当前用户身份。
 * 客户端与服务端统一通过 JWT Cookie 鉴权。
 *
 * 使用示例：
 *   const auth = await authMiddleware(req);
 *   if (!auth.userId) return Response.json({ code: 401, message: "请先登录" }, { status: 401 });
 */
import { getAuthenticatedUser, type JwtPayload } from "./index";

export interface AuthResult {
  userId: number | null;
  username: string | null;
}

/**
 * 服务端 API 鉴权中间件 — 统一 JWT Cookie 校验
 */
export async function authMiddleware(req: Request): Promise<AuthResult> {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return { userId: null, username: null };
  }

  return {
    userId: user.userId,
    username: user.username,
  };
}

export type { JwtPayload };
