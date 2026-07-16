/**
 * 基础文本写入 —— write_text_file
 *
 * 在当前工作空间根目录下创建或覆盖纯文本文件。
 * 大模型只负责推理出内容，由本工具完成文件物化。
 *
 * ★ DeepSeek 兼容：模型可能发送 file_path 或 path，两者都接受。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import fs from "fs";
import path from "path";

export const writeTextFile = tool({
  description:
    "在当前工作空间根目录下创建或覆盖纯文本文件。参数 file_path 是相对于工作空间根目录的文件路径（例如 'HelloWorld.java'、'src/Main.java'），参数 content 是要写入的文本内容。会自动创建不存在的父目录。适用于保存代码、报告、脚本、配置文件、Markdown 文档等。",
  parameters: z.object({
    file_path: z
      .string()
      .describe(
        "文件路径，相对于工作空间根目录，例如 'HelloWorld.java'、'src/Main.java'"
      ),
    content: z.string().describe("要写入的完整文本内容"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: any): Promise<string> => {
    try {
      // ★ DeepSeek 兼容：接受 file_path 或 path
      const filePath: string = args.file_path ?? args.path ?? "";
      const content: string = args.content ?? "";

      if (!filePath) {
        return JSON.stringify({
          status: "error",
          error: "write_text_file 失败: 缺少 file_path 参数",
        });
      }

      const safePath = resolveWorkspaceAwarePath(filePath);
      console.log(`[writeTextFile] 入参 file_path="${filePath}", 解析后 safePath="${safePath}"`);

      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
        console.log(`[writeTextFile] 已创建父目录: ${parentDir}`);
      }

      fs.writeFileSync(safePath, content, "utf-8");
      const stat = fs.statSync(safePath);
      console.log(`[writeTextFile] ✅ 文件已写入: ${safePath} (${stat.size} bytes)`);

      return JSON.stringify({
        status: "success",
        filePath,
        resolvedPath: safePath,
        fileSize: stat.size,
        message: `文件已成功写入: ${filePath} (${stat.size} bytes)`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      console.error(`[writeTextFile] ❌ 写入失败: ${message}`);
      return JSON.stringify({
        status: "error",
        error: `write_text_file 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
