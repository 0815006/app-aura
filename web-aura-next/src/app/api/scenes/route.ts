/**
 * GET /api/scenes — 获取可用场景列表
 *
 * 仅返回 status = 'active' 的场景，按 sort_order 升序排列。
 * 不返回 system_prompt（仅在选择具体场景时返回）。
 *
 * 首次访问时自动初始化场景种子数据。
 */
import { db } from "@/lib/db/client";
import { sceneDefinitions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { seedScenes } from "@/lib/db/seed/scenes";

let seedInitialized = false;

export async function GET() {
  // 懒初始化种子数据（仅运行一次）
  if (!seedInitialized) {
    seedInitialized = true;
    seedScenes().catch((err) => {
      console.error("[Scenes] 种子初始化失败:", err);
    });
  }

  try {
    const scenes = await db.query.sceneDefinitions.findMany({
      where: eq(sceneDefinitions.status, "active"),
      orderBy: asc(sceneDefinitions.sortOrder),
      columns: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        dbRequired: true,
        requiredInputs: true,
        sortOrder: true,
      },
    });

    return Response.json({
      code: 200,
      message: "success",
      data: { scenes },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Scenes GET] 获取场景列表失败:", message);
    return Response.json(
      { code: 500, message: `获取场景列表失败: ${message}` },
      { status: 500 }
    );
  }
}
