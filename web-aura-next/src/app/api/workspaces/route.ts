import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import {
  createWorkspaceDirForUser,
  removeWorkspaceDirForUser,
} from "@/lib/env";
import { getAuthenticatedUser } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/workspaces
 * 获取当前用户的工作空间列表，或指定 id 的工作空间详情
 *
 * Query:
 * - ?id=uuid  获取单个工作空间
 * - 无参数     获取全部 active 工作空间列表
 *
 * ★ Phase 7: 严格按 user_id 过滤
 */
export async function GET(req: Request) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const rows = await db
        .select()
        .from(workspaces)
        .where(
          and(eq(workspaces.id, id), eq(workspaces.userId, auth.userId))
        )
        .limit(1);

      if (rows.length === 0) {
        return Response.json(
          { code: 404, message: `工作空间 ${id} 不存在` },
          { status: 404 }
        );
      }

      return Response.json({
        code: 200,
        message: "success",
        data: rows[0],
      });
    }

    const rows = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.userId, auth.userId),
          eq(workspaces.status, "active")
        )
      )
      .orderBy(desc(workspaces.updateTime));

    return Response.json({
      code: 200,
      message: "success",
      data: rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `获取工作空间列表失败: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 * 新建工作空间
 *
 * Body: { name: string }
 * 返回: { id, name, ... }
 *
 * ★ Phase 7: 关联 user_id + 按用户创建目录
 */
export async function POST(req: Request) {
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
    const name = String(body.name ?? "").trim();

    if (!name) {
      return Response.json(
        { code: 400, message: "工作空间名称不能为空" },
        { status: 400 }
      );
    }

    if (name.length > 255) {
      return Response.json(
        { code: 400, message: "工作空间名称不能超过 255 个字符" },
        { status: 400 }
      );
    }

    const [row] = await db
      .insert(workspaces)
      .values({ name, userId: auth.userId })
      .returning();

    // 按用户创建目录
    createWorkspaceDirForUser(auth.userId, row.id);

    return Response.json({
      code: 200,
      message: "工作空间创建成功",
      data: row,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `创建工作空间失败: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces?id=uuid
 * 删除工作空间（物理删除目录 + DB 记录）
 *
 * ★ Phase 7: 校验 user_id 归属
 */
export async function DELETE(req: Request) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { code: 400, message: "缺少工作空间 id 参数" },
        { status: 400 }
      );
    }

    // 校验归属
    const rows = await db
      .select()
      .from(workspaces)
      .where(
        and(eq(workspaces.id, id), eq(workspaces.userId, auth.userId))
      )
      .limit(1);

    if (rows.length === 0) {
      return Response.json(
        { code: 404, message: `工作空间 ${id} 不存在或无权访问` },
        { status: 404 }
      );
    }

    removeWorkspaceDirForUser(auth.userId, id);
    await db
      .delete(workspaces)
      .where(
        and(eq(workspaces.id, id), eq(workspaces.userId, auth.userId))
      );

    return Response.json({
      code: 200,
      message: "工作空间已删除",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `删除工作空间失败: ${message}` },
      { status: 500 }
    );
  }
}
