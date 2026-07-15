/**
 * POST /api/auth/logout
 *
 * 登出接口：清除 aura_token Cookie。
 *
 * Response:
 *   200 → { code: 200, message: "已登出" }
 */
import { clearCookie, AUTH_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const response = Response.json({
    code: 200,
    message: "已登出",
  });

  response.headers.set("Set-Cookie", clearCookie(AUTH_COOKIE_NAME));

  return response;
}
