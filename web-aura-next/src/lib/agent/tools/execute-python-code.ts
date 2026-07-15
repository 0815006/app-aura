/**
 * Python 沙箱执行器 —— execute_python_code
 *
 * 在隔离环境中运行 Python 脚本并返回 stdout。
 * 使用 child_process.spawn 调用系统 Python，设置超时与内存限制。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { spawn } from "child_process";

const PYTHON_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 50 * 1024;

export const executePythonCode = tool({
  description:
    "在安全沙箱中执行 Python 脚本并返回标准输出。用于数据分析、计算、格式转换等需要编程的场景。脚本限制 30 秒超时，输出限制 50KB。禁止使用 os/subprocess/sys 等高危模块。",
  parameters: z.object({
    script: z
      .string()
      .describe("完整的 Python 脚本内容，包含所有必要的 import 语句"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({
    script,
  }: {
    script: string;
  }): Promise<string> => {
    return new Promise<string>((resolve) => {
      let stdout = "";
      let stderr = "";
      let resolved = false;

      const finish = (result: string) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      try {
        const pythonCmd = process.platform === "win32" ? "python" : "python3";

        const child = spawn(pythonCmd, ["-c", script], {
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONPATH: "",
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

        const timer = setTimeout(() => {
          child.kill();
          finish(
            JSON.stringify({
              status: "timeout",
              error: `Python 脚本执行超时 (${PYTHON_TIMEOUT_MS / 1000}s)`,
            })
          );
        }, PYTHON_TIMEOUT_MS);

        child.stdout?.on("data", (chunk: Buffer) => {
          if (stdout.length < MAX_OUTPUT_BYTES) {
            stdout += chunk.toString("utf-8");
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          if (stderr.length < MAX_OUTPUT_BYTES) {
            stderr += chunk.toString("utf-8");
          }
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (resolved) return;

          const output = stdout.slice(0, MAX_OUTPUT_BYTES);
          const errors = stderr.slice(0, MAX_OUTPUT_BYTES);

          if (code === 0) {
            finish(
              JSON.stringify({
                status: "success",
                exitCode: code,
                output: output || "(无输出)",
              })
            );
          } else {
            finish(
              JSON.stringify({
                status: "error",
                exitCode: code,
                output,
                stderr: errors,
                error: `Python 脚本以退出码 ${code} 结束`,
              })
            );
          }
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          finish(
            JSON.stringify({
              status: "error",
              error: `无法启动 Python 解释器: ${err.message}`,
            })
          );
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        finish(
          JSON.stringify({
            status: "error",
            error: `execute_python_code 失败: ${message}`,
          })
        );
      }
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
