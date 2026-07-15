/**
 * 基础文本写入 —— write_text_file
 *
 * 在指定路径（限于 DATA_ROOT 范围内）创建或覆盖纯文本文件。
 * 大模型只负责推理出内容，由本工具完成文件物化。
 *
 * 规范要点：
 * - 第一行强制路径越权校验（resolveSafePath）
 * - 自动创建父目录
 * - 覆盖写入（幂等）
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import fs from "fs";
import path from "path";

export const writeTextFile = tool({
  description:
    "在 DATA_ROOT 工作空间中创建或覆盖纯文本文件。传入文件路径（相对于 DATA_ROOT 根目录，例如 'docs/first.md'、'workspaces/报告.txt'）和文本内容。会自动创建不存在的父目录，所以你可以直接写 'docs/first.md' 而无需先创建 docs 目录。适用于保存分析报告、脚本、配置文件、Markdown 文档等。",
  parameters: z.object({
    filePath: z
      .string()
      .describe(
        "文件路径，相对于 DATA_ROOT 根目录，例如 'workspaces/report.md'"
      ),
    content: z.string().describe("要写入的完整文本内容"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({
    filePath,
    content,
  }: {
    filePath: string;
    content: string;
  }): Promise<string> => {
    try {
      const safePath = resolveWorkspaceAwarePath(filePath);

      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(safePath, content, "utf-8");
      const stat = fs.statSync(safePath);

      return JSON.stringify({
        status: "success",
        filePath,
        fileSize: stat.size,
        message: `文件已成功写入: ${filePath} (${stat.size} bytes)`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        error: `write_text_file 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
