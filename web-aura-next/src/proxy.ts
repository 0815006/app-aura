import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Middleware — 全局 CORS 适配
 *
 * Tauri 桌面客户端从 tauri://localhost 自定义协议加载前端页面，
 * 发起 fetch("http://22.189.27.133:8086/api/...") 属于跨协议请求。
 *
 * 不同 WebView2 版本对自定义协议 Origin 的处理不一致：
 * - 部分版本正常发送 Origin: tauri://localhost
 * - 部分版本不发送 Origin 头（空值）
 *
 * 本中间件处理两种场景并响应 OPTIONS 预检请求（204 No Content）。
 *
 * CORS 允许列表：
 * - 轻量的 /api/health 使用 *（无需 Cookie）
 * - 其他 /api/* 路由若 Origin 存在则回射 Origin + credentials
 */
export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = (req.headers.get("origin") || "").trim();
  const isHealth = req.nextUrl.pathname === "/api/health";

  // OPTIONS 预检请求 —— 直接返回 204
  if (req.method === "OPTIONS") {
    const allowOrigin = origin || "*";
    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Aura-Local-Key, x-aura-local-key",
      "Access-Control-Max-Age": "86400",
    };
    // 有明确 Origin 时才允许 credentials
    if (origin) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
    return new NextResponse(null, { status: 204, headers });
  }

  // 常规请求 —— 追加 CORS 头后放行
  const response = NextResponse.next();

  if (origin) {
    // 明确 Origin：回射 Origin + 允许 Cookie
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  } else if (isHealth) {
    // 无 Origin + health 端点：允许任意来源（不需要 Cookie）
    response.headers.set("Access-Control-Allow-Origin", "*");
  }
  // 无 Origin 且非 health：不加 Allow-Origin（同源请求无需 CORS）

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Aura-Local-Key, x-aura-local-key"
  );

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
