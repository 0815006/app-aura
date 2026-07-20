/**
 * Aura API 鉴权中间件
 *
 * 服务端 API 在执行业务逻辑前调用此中间件，获取当前用户身份。
 *
 * 鉴权逻辑：
 * - 携带 X-Aura-Local-Key Header（客户端免登模式）→ 放行，返回 null，不做 JWT 鉴权
 * - 否则 → 强制校验 JWT Cookie，未登录返回 { userId: null }
 *
 * 使用示例：
 *   const auth = await authMiddleware(req);
 *   if (!auth.userId) return Response.json({ code: 401, message: "请先登录" }, { status: 401 });
 */
import { getAuthenticatedUser, type JwtPayload } from "./index";

export interface AuthResult {
  userId: number | null;
  username: string | null;
  /** 是否为客户端免登模式 */
  isClientMode: boolean;
}

/**
 * 服务端 API 鉴权中间件
 * X-Aura-Local-Key 免登放行；否则 JWT Cookie 强制校验。
 */
export async function authMiddleware(req: Request): Promise<AuthResult> {
  // 检查是否有 X-Aura-Local-Key (客户端免登模式连服务端)
  const localKey = req.headers.get("x-aura-local-key");
  if (localKey) {
    return { userId: null, username: null, isClientMode: true };
  }

  const user = await getAuthenticatedUser(req);

  if (!user) {
    return { userId: null, username: null, isClientMode: false };
  }

  return {
    userId: user.userId,
    username: user.username,
    isClientMode: false,
  };
}

export type { JwtPayload };
