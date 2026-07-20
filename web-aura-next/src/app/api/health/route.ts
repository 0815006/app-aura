/**
 * GET /api/health
 *
 * 健康检查端点 —— 客户端轮询此端点判断服务器是否可达。
 *
 * Response:
 *   200 → { status: "ok", timestamp: "2026-07-20T..." }
 */
export async function GET() {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
