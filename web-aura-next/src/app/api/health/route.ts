/**
 * GET /api/health
 *
 * 健康检查端点 —— 客户端轮询此端点判断服务器是否可达。
 *
 * Tauri WebView2 从 tauri://localhost 发送跨协议请求，
 * 此处显式设置 CORS 头作为 Middleware 之外的第二层防御。
 *
 * Response:
 *   200 → { status: "ok", timestamp: "2026-07-20T..." }
 */
export async function GET() {
  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }
  );
}

/**
 * OPTIONS /api/health
 *
 * CORS 预检请求处理 —— 部分 WebView2 版本会对 GET 也发预检。
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
