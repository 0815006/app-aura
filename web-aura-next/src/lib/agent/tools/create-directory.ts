/**
 * 目录创建器 —— create_directory
 *
 * 在当前工作空间根目录下创建目录。
 * 自动创建所有不存在的父目录（recursive）。
 *
 * ★ DeepSeek 兼容：模型可能发送 dir_path 或 path，两者都接受。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import fs from "fs";

export const createDirectory = tool({
  description:
    "在当前工作空间根目录下创建目录。参数 dir_path 是相对于工作空间根目录的路径，会自动创建所有不存在的父目录。如果目录已存在则静默成功。示例：create_directory({ dir_path: 'src' }) 会在根目录创建 src 文件夹。",
  parameters: z.object({
    dir_path: z
      .string()
      .describe(
        "要创建的目录路径，相对于工作空间根目录，例如 'src'、'docs/api'"
      ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: any): Promise<string> => {
    try {
      // ★ DeepSeek 兼容：接受 dir_path 或 path
      const dirPath: string = args.dir_path ?? args.path ?? "";

      if (!dirPath) {
        return JSON.stringify({
          status: "error",
          error: "create_directory 失败: 缺少 dir_path 参数",
        });
      }

      const safePath = resolveWorkspaceAwarePath(dirPath);
      console.log(`[createDirectory] 入参 dir_path="${dirPath}", 解析后 safePath="${safePath}"`);

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
      console.error(`[createDirectory] ❌ 创建失败: ${message}`);
      return JSON.stringify({
        status: "error",
        error: `create_directory 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
