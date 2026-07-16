import { isServerMode, getDataRoot } from "@/lib/env";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * GET /api/workspaces/file?id=uuid&subpath=subdir/file.txt
 * 读取工作空间内指定文件的内容
 *
 * ★ Phase 7: 按 user_id 校验 workspace 归属 + 双重路径越权校验
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
    const filePath = searchParams.get("subpath");

    if (!workspaceId || !filePath) {
      return Response.json(
        { code: 400, message: "缺少 id 或 subpath 参数" },
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
    let targetPath = path.resolve(workspaceRoot, filePath);

    // ★ 兼容旧版工作空间（同 tree API 逻辑）
    if (!fs.existsSync(workspaceRoot)) {
      const legacyRoot = path.resolve(dataRoot, "workspaces", workspaceId);
      if (fs.existsSync(legacyRoot)) {
        console.log(
          `[File API] 检测到旧版工作空间目录，使用旧路径: ${legacyRoot}`
        );
        targetPath = path.resolve(legacyRoot, filePath);
      }
    }

    // 双重校验
    if (!targetPath.startsWith(workspaceRoot) && !targetPath.startsWith(path.resolve(dataRoot, "workspaces", workspaceId))) {
      return Response.json(
        { code: 403, message: "路径越权" },
        { status: 403 }
      );
    }

    if (!fs.existsSync(targetPath)) {
      return Response.json(
        { code: 404, message: "文件不存在" },
        { status: 404 }
      );
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      return Response.json(
        { code: 400, message: "路径指向的是目录，不是文件" },
        { status: 400 }
      );
    }

    const MAX_READ_SIZE = 1024 * 1024; // 1MB
    if (stat.size > MAX_READ_SIZE) {
      return Response.json(
        { code: 400, message: `文件过大 (${(stat.size / 1024).toFixed(1)}KB)，无法预览` },
        { status: 400 }
      );
    }

    const content = fs.readFileSync(targetPath, "utf-8");

    return Response.json({
      code: 200,
      message: "success",
      data: {
        path: filePath,
        size: stat.size,
        content,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `读取文件失败: ${message}` },
      { status: 500 }
    );
  }
}
