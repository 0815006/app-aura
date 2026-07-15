import { isServerMode, getDataRoot } from "@/lib/env";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * GET /api/workspaces/tree?id=uuid&subpath=
 * 获取工作空间内目录树
 *
 * Query:
 * - id=uuid       工作空间 ID
 * - subpath=      子路径（可选，默认根目录）
 *
 * ★ Phase 7: 按 user_id 查询 workspace + 路径双重越权校验
 */
export async function GET(req: Request) {
  if (!isServerMode()) {
    return Response.json(
      { code: 400, message: "仅服务端模式可用" },
      { status: 400 }
    );
  }

  try {
    // 1. 鉴权
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");
    const subpath = searchParams.get("subpath") || "";

    if (!workspaceId) {
      return Response.json(
        { code: 400, message: "缺少工作空间 id 参数" },
        { status: 400 }
      );
    }

    // 2. 校验 workspace 归属
    const [ws] = await db
      .select({ id: workspaces.id, userId: workspaces.userId })
      .from(workspaces)
      .where(
        and(eq(workspaces.id, workspaceId), eq(workspaces.userId, auth.userId))
      )
      .limit(1);

    if (!ws) {
      return Response.json(
        { code: 404, message: "工作空间不存在或无权访问" },
        { status: 404 }
      );
    }

    // 3. 构建路径并双重越权校验
    const dataRoot = getDataRoot();
    const userRoot = path.resolve(dataRoot, "workspaces", `user_${auth.userId}`);
    const workspaceRoot = path.resolve(userRoot, workspaceId);
    const targetDir = path.resolve(workspaceRoot, subpath);

    // 双重校验：不得跳出工作空间，不得跳出用户目录
    if (!targetDir.startsWith(workspaceRoot)) {
      return Response.json(
        { code: 403, message: "路径越权" },
        { status: 403 }
      );
    }
    if (!targetDir.startsWith(userRoot)) {
      return Response.json(
        { code: 403, message: "路径越权：禁止访问其他用户的工作空间" },
        { status: 403 }
      );
    }

    if (!fs.existsSync(targetDir)) {
      return Response.json({
        code: 200,
        message: "success",
        data: { path: subpath, entries: [] },
      });
    }

    const dirents = fs.readdirSync(targetDir, { withFileTypes: true });

    const entries = dirents
      .filter((d) => d.name !== ".meta")
      .map((d) => ({
        name: d.name,
        path: path.join(subpath, d.name).replace(/\\/g, "/"),
        isDirectory: d.isDirectory(),
        isFile: d.isFile(),
        ...(d.isFile()
          ? { size: fs.statSync(path.join(targetDir, d.name)).size }
          : {}),
      }));

    // 目录在前，文件在后，各自按名称排序
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return Response.json({
      code: 200,
      message: "success",
      data: { path: subpath, entries },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `获取目录树失败: ${message}` },
      { status: 500 }
    );
  }
}
