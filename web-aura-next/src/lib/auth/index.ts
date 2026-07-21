/**
 * Aura Auth 工具库
 *
 * 职责：
 * - 密码哈希/验证 (bcrypt)
 * - JWT 签发/验证 (jose, HS256, 7天过期)
 * - 从 Request 中提取并验证用户身份
 */
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// ============================================================
// 常量
// ============================================================

export const AUTH_COOKIE_NAME = "aura_token";
const JWT_SECRET_BASE = process.env.AURA_JWT_SECRET || "aura-jwt-dev-secret-change-in-production";
const JWT_EXPIRATION = "7d";
const JWT_ALGORITHM = "HS256";

// jose 要求 Uint8Array 格式的密钥
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_BASE);

// JWT payload 结构
export interface JwtPayload {
  userId: number;
  username: string;
}

// ============================================================
// 密码哈希
// ============================================================

const SALT_ROUNDS = 12;

/** 对明文密码进行 bcrypt 哈希 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** 验证明文密码是否与哈希匹配 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ============================================================
// JWT 签发与验证
// ============================================================

/** 签发 JWT (HS256, 7天过期) */
export async function signJWT(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(JWT_SECRET);
}

/** 验证并解析 JWT，返回 payload 或 null */
export async function verifyJWT(
  token: string
): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });
    return {
      userId: payload.userId as number,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

// ============================================================
// 请求级用户身份提取
// ============================================================

/**
 * 从 Request 中提取 JWT 并验证，返回用户身份。
 * 用于服务端 Route Handler 中获取当前登录用户。
 *
 * 支持两种 Token 来源（按优先级）：
 * 1. Authorization: Bearer <token> — 客户端模式（Tauri 跨协议）
 * 2. Cookie: aura_token=<token> — 服务端模式（浏览器同源）
 *
 * @returns JwtPayload | null  — null 表示未登录或 Token 无效
 */
export async function getAuthenticatedUser(
  req: Request
): Promise<JwtPayload | null> {
  let token: string | null = null;

  // 方式 1: Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    token = bearerMatch[1].trim();
  }

  // 方式 2: Cookie aura_token（fallback）
  if (!token) {
    const cookieHeader = req.headers.get("cookie") || "";
    const cookies = parseCookies(cookieHeader);
    token = cookies[AUTH_COOKIE_NAME] || null;
  }

  if (!token) return null;

  // 验证 JWT
  const payload = await verifyJWT(token);
  return payload;
}

// ============================================================
// Cookie 序列化/反序列化辅助
// ============================================================

/** 简易 Cookie 解析器（无需额外依赖） */
function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  cookieHeader.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    result[key] = decodeURIComponent(value);
  });
  return result;
}

/**
 * 生成 Set-Cookie 头字符串
 */
export function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
    maxAge?: number;
  } = {}
): string {
  const parts: string[] = [`${name}=${encodeURIComponent(value)}`];

  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

/** 清除 Cookie 的 Set-Cookie 头 */
export function clearCookie(name: string): string {
  return serializeCookie(name, "", { maxAge: 0 });
}
