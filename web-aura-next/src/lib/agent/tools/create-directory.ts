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
    "在 DATA_ROOT 工作空间中创建目录。传入相对于 DATA_ROOT 的目录路径，会自动创建所有不存在的父目录。如果目录已存在则静默成功。示例：create_directory('docs') 会在根目录创建 docs 文件夹。",
  parameters: z.object({
    dirPath: z
      .string()
      .describe(
        "要创建的目录路径，相对于 DATA_ROOT 根目录，例如 'docs'、'workspaces/my-ws/subdir'"
      ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({ dirPath }: { dirPath: string }): Promise<string> => {
    try {
      const safePath = resolveWorkspaceAwarePath(dirPath);

      if (fs.existsSync(safePath)) {
        return JSON.stringify({
          status: "success",
          dirPath,
          existed: true,
          message: `目录已存在: ${dirPath}`,
        });
      }

      fs.mkdirSync(safePath, { recursive: true });

      return JSON.stringify({
        status: "success",
        dirPath,
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
