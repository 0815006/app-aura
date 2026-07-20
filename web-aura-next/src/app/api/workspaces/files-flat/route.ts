import { getDataRoot } from "@/lib/env";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * GET /api/workspaces/files-flat?id=uuid
 * 递归获取工作空间内所有文件的扁平列表（用于 @ 文件提及自动补全）
 *
 * Query:
 * - id=uuid  工作空间 ID
 *
 * 返回: { code: 200, data: { files: { name: string, path: string }[] } }
 */
export async function GET(req: Request) {
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

    // 3. 构建路径
    const dataRoot = getDataRoot();
    const userRoot = path.resolve(dataRoot, "workspaces", `user_${auth.userId}`);
    const workspaceRoot = path.resolve(userRoot, workspaceId);

    // 兼容旧版路径
    let actualRoot = workspaceRoot;
    if (!fs.existsSync(workspaceRoot)) {
      const legacyRoot = path.resolve(dataRoot, "workspaces", workspaceId);
      if (fs.existsSync(legacyRoot)) {
        actualRoot = legacyRoot;
      } else {
        // 目录不存在，返回空列表
        return Response.json({
          code: 200,
          message: "success",
          data: { files: [] },
        });
      }
    }

    // 4. 递归遍历所有文件
    const files = walkFiles(actualRoot, actualRoot);

    return Response.json({
      code: 200,
      message: "success",
      data: { files },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `获取文件列表失败: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * 递归遍历目录，返回所有文件（跳过 .meta 目录和子目录条目）
 */
function walkFiles(
  dir: string,
  baseDir: string
): { name: string; path: string }[] {
  const results: { name: string; path: string }[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === ".meta") continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.isFile()) {
      results.push({ name: entry.name, path: relativePath });
    } else if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, baseDir));
    }
  }

  return results;
}
