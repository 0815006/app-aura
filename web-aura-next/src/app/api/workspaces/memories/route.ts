import { db } from "@/lib/db/client";
import { workspaceMemories } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { isServerMode } from "@/lib/env";
import { eq, desc, and } from "drizzle-orm";

/**
 * GET /api/workspaces/memories?workspaceId=xxx&category=tech-stack
 *
 * 获取指定工作空间的长期记忆列表。
 * 按 importance 降序排列，优先返回重要记忆。
 *
 * Query 参数：
 * - workspaceId (必填): 工作空间 UUID
 * - category (可选): 按分类过滤
 */
export async function GET(req: Request) {
  if (!isServerMode()) {
    return Response.json(
      { code: 400, message: "记忆管理仅服务端模式可用" },
      { status: 400 }
    );
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const category = searchParams.get("category");

    if (!workspaceId) {
      return Response.json(
        { code: 400, message: "缺少 workspaceId 参数" },
        { status: 400 }
      );
    }

    const validCategories = ["tech-stack", "convention", "user-pref", "fact", "general"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereConditions: any[] = [eq(workspaceMemories.workspaceId, workspaceId)];
    if (category && validCategories.includes(category)) {
      whereConditions.push(
        eq(workspaceMemories.category, category as "tech-stack" | "convention" | "user-pref" | "fact" | "general")
      );
    }

    const rows = await db
      .select({
        id: workspaceMemories.id,
        key: workspaceMemories.key,
        content: workspaceMemories.content,
        category: workspaceMemories.category,
        importance: workspaceMemories.importance,
        sourceRunId: workspaceMemories.sourceRunId,
        createTime: workspaceMemories.createTime,
        updateTime: workspaceMemories.updateTime,
      })
      .from(workspaceMemories)
      .where(and(...whereConditions))
      .orderBy(desc(workspaceMemories.importance));

    return Response.json({
      code: 200,
      message: "success",
      data: rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[memories] 查询失败:", err);
    return Response.json(
      { code: 500, message: `获取记忆列表失败: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/memories
 *
 * 手动创建一条工作空间记忆。
 *
 * Body: { workspaceId, key, content, category?, importance? }
 */
export async function POST(req: Request) {
  if (!isServerMode()) {
    return Response.json(
      { code: 400, message: "记忆管理仅服务端模式可用" },
      { status: 400 }
    );
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;
    const { workspaceId, key, content, category, importance } = body;

    if (!workspaceId || !key || !content) {
      return Response.json(
        { code: 400, message: "缺少必填字段: workspaceId, key, content" },
        { status: 400 }
      );
    }

    const now = new Date();
    const validCategories = ["tech-stack", "convention", "user-pref", "fact", "general"];

    await db.insert(workspaceMemories).values({
      workspaceId,
      key,
      content,
      category: validCategories.includes(category) ? category : "general",
      importance: Math.min(10, Math.max(0, Math.round(importance ?? 5))),
      createTime: now,
      updateTime: now,
    });

    return Response.json({
      code: 200,
      message: "记忆创建成功",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[memories] 创建失败:", err);
    return Response.json(
      { code: 500, message: `创建记忆失败: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/memories?id=xxx
 *
 * 删除一条工作空间记忆。
 */
export async function DELETE(req: Request) {
  if (!isServerMode()) {
    return Response.json(
      { code: 400, message: "记忆管理仅服务端模式可用" },
      { status: 400 }
    );
  }

  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const idStr = searchParams.get("id");

    if (!idStr) {
      return Response.json(
        { code: 400, message: "缺少 id 参数" },
        { status: 400 }
      );
    }

    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return Response.json(
        { code: 400, message: "id 参数格式错误" },
        { status: 400 }
      );
    }

    await db.delete(workspaceMemories).where(eq(workspaceMemories.id, id));

    return Response.json({
      code: 200,
      message: "记忆已删除",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[memories] 删除失败:", err);
    return Response.json(
      { code: 500, message: `删除记忆失败: ${message}` },
      { status: 500 }
    );
  }
}
