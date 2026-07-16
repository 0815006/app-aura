/**
 * 全文读取器 —— read_file_full
 *
 * 读取小文件的完整文本内容。
 * 仅用于小文件（默认 <500KB），大文件请使用 preview_file_lines 预览。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import fs from "fs";

const MAX_FILE_SIZE = 500 * 1024; // 500KB

export const readFileFull = tool({
  description:
    "读取指定文件的完整文本内容。仅适用于小于 500KB 的文本文件。对于大文件，请先用 preview_file_lines 预览。返回文件内容字符串。",
  parameters: z.object({
    path: z.string().describe("要读取的文件路径，相对于工作空间根目录，例如 'src/Main.java'"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({ path: filePath }: { path: string }): Promise<string> => {
    try {
      const safePath = resolveWorkspaceAwarePath(filePath);
      const stat = fs.statSync(safePath);

      if (stat.size > MAX_FILE_SIZE) {
        return JSON.stringify({
          status: "warning",
          filePath,
          fileSize: stat.size,
          error: `文件过大 (${(stat.size / 1024).toFixed(1)} KB)，超过 ${MAX_FILE_SIZE / 1024} KB 限制。请使用 preview_file_lines 预览。`,
        });
      }

      if (stat.size === 0) {
        return JSON.stringify({
          status: "success",
          filePath,
          fileSize: 0,
          content: "",
          message: "文件为空",
        });
      }

      const content = fs.readFileSync(safePath, "utf-8");

      return JSON.stringify({
        status: "success",
        filePath,
        fileSize: stat.size,
        lineCount: content.split("\n").length,
        content,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        error: `read_file_full 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
