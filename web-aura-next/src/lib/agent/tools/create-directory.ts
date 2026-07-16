/**
 * 目录创建器 —— create_directory
 *
 * 在指定路径（限于 DATA_ROOT 范围内）创建目录。
 * 自动创建所有不存在的父目录（recursive）。
 *
 * 规范要点：
 * - 第一行强制路径越权校验（resolveSafePath）
 * - 幂等：目录已存在时不报错
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import fs from "fs";

export const createDirectory = tool({
  description:
    "在当前工作空间根目录下创建目录。传入相对于工作空间根目录的路径，会自动创建所有不存在的父目录。如果目录已存在则静默成功。示例：create_directory('src') 会在根目录创建 src 文件夹。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "要创建的目录路径，相对于工作空间根目录，例如 'src'、'docs/api'"
      ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({ path: dirPath }: { path: string }): Promise<string> => {
    try {
      const safePath = resolveWorkspaceAwarePath(dirPath);
      console.log(`[createDirectory] 入参 path="${dirPath}", 解析后 safePath="${safePath}"`);

      if (fs.existsSync(safePath)) {
        return JSON.stringify({
          status: "success",
          dirPath,
          resolvedPath: safePath,
          existed: true,
          message: `目录已存在: ${dirPath}`,
        });
      }

      fs.mkdirSync(safePath, { recursive: true });
      console.log(`[createDirectory] ✅ 目录已创建: ${safePath}`);

      return JSON.stringify({
        status: "success",
        dirPath,
        resolvedPath: safePath,
        existed: false,
        message: `目录已成功创建: ${dirPath}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        error: `create_directory 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
