/**
 * GET /api/scenes/[slug] — 获取场景详情
 *
 * 返回完整场景配置，包括 systemPrompt、toolWhitelist 等。
 * 用于前端选择场景后加载场景专属配置。
 */
import { db } from "@/lib/db/client";
import { sceneDefinitions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    const scene = await db.query.sceneDefinitions.findFirst({
      where: and(
        eq(sceneDefinitions.slug, slug),
        eq(sceneDefinitions.status, "active")
      ),
    });

    if (!scene) {
      return Response.json(
        { code: 404, message: `场景不存在: ${slug}` },
        { status: 404 }
      );
    }

    return Response.json({
      code: 200,
      message: "success",
      data: scene,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error(`[Scenes GET] 获取场景详情失败:`, message);
    return Response.json(
      { code: 500, message: `获取场景详情失败: ${message}` },
      { status: 500 }
    );
  }
}
