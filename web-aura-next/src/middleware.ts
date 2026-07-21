import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Middleware — 全局 CORS 适配
 *
 * Tauri 桌面客户端从 tauri://localhost 自定义协议加载前端页面，
 * 发起 fetch("http://22.189.27.133:8086/api/...") 属于跨域请求，
 * 浏览器引擎会执行 CORS 预检（OPTIONS）和校验。
 *
 * 本中间件为所有 /api/* 请求添加 CORS 响应头，
 * 并直接响应 OPTIONS 预检请求（204 No Content）。
 */
export function middleware(req: NextRequest) {
  // 仅处理 /api/* 路由
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin") || "";

  // OPTIONS 预检请求 —— 直接返回 204
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Aura-Local-Key, x-aura-local-key",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // 预检缓存 24 小时
      },
    });
  }

  // 常规请求 —— 追加 CORS 头后放行
  const response = NextResponse.next();

  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
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

/**
 * 限定中间件匹配路径：仅 /api/* 触发
 */
export const config = {
  matcher: "/api/:path*",
};
