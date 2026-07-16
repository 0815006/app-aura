/**
 * 智能预览器 —— preview_file_lines
 *
 * 读取文件前 N 行，避免大文件 Token 溢出。
 * 适合大模型在分析日志、脚本前先"看一眼"文件内容再决定是否全文读取。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import fs from "fs";

const MAX_PREVIEW_LINES = 200;
const MAX_PREVIEW_BYTES = 100 * 1024; // 100KB

export const previewFileLines = tool({
  description:
    "读取文件前 N 行内容，用于预览大文件的开头部分。避免一次性读取整个大文件导致 Token 溢出。默认读取前 50 行，最多 200 行。",
  parameters: z.object({
    path: z.string().describe("要预览的文件路径，相对于工作空间根目录，例如 'src/Main.java'"),
    lines: z
      .number()
      .int()
      .positive()
      .max(MAX_PREVIEW_LINES)
      .default(50)
      .describe(`预览行数，默认 50，最大 ${MAX_PREVIEW_LINES}`),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({
    path: filePath,
    lines = 50,
  }: {
    path: string;
    lines?: number;
  }): Promise<string> => {
    try {
      const safePath = resolveWorkspaceAwarePath(filePath);
      const stat = fs.statSync(safePath);

      if (stat.size > MAX_PREVIEW_BYTES) {
        return JSON.stringify({
          status: "warning",
          filePath,
          fileSize: stat.size,
          message: `文件过大 (${(stat.size / 1024).toFixed(1)} KB)，仅展示前 ${lines} 行`,
          content: readHeadLines(safePath, lines),
          totalLines: "未知（文件过大未统计）",
        });
      }

      const allContent = fs.readFileSync(safePath, "utf-8");
      const allLines = allContent.split("\n");
      const preview = allLines.slice(0, lines).join("\n");

      return JSON.stringify({
        status: "success",
        filePath,
        fileSize: stat.size,
        previewLines: Math.min(lines, allLines.length),
        totalLines: allLines.length,
        content: preview,
        truncated: allLines.length > lines,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        error: `preview_file_lines 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

function readHeadLines(filePath: string, maxLines: number): string {
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(4096);
  const chunks: string[] = [];
  let linesRead = 0;
  let leftover = "";

  try {
    while (linesRead < maxLines) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;

      const text = leftover + buffer.toString("utf-8", 0, bytesRead);
      const splitLines = text.split("\n");

      leftover = splitLines.pop() || "";

      for (const line of splitLines) {
        chunks.push(line);
        linesRead++;
        if (linesRead >= maxLines) break;
      }
    }
    return chunks.join("\n");
  } finally {
    fs.closeSync(fd);
  }
}
