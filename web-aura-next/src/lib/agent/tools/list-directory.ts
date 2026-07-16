/**
 * 目录探测器 —— list_directory
 *
 * 获取指定目录下的子目录和文件列表，用于浏览工作空间目录结构。
 * 服务端：校验 DATA_ROOT 越权；客户端：调用 Tauri 原生 API。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import { getDataRoot } from "@/lib/env";
import fs from "fs";
import path from "path";

export const listDirectory = tool({
  description:
    "获取当前工作空间指定目录下的子目录和文件列表。返回 JSON 格式的目录树。",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "要浏览的目录路径，相对于工作空间根目录，例如 '' 表示根目录、'src' 表示子目录"
      ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({ path: dirPath }: { path: string }): Promise<string> => {
    try {
      const safePath = resolveWorkspaceAwarePath(dirPath);
      const entries = fs.readdirSync(safePath, { withFileTypes: true });

      const result = entries.map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name).replace(/\\/g, "/"),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));

      return JSON.stringify({
        status: "success",
        path: dirPath || getDataRoot(),
        count: result.length,
        entries: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        error: `list_directory 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
