/**
 * 通用网络请求 —— http_request
 *
 * 自主发起标准 HTTP 请求，支持 GET/POST/PUT/DELETE/PATCH 方法。
 * 用于连接 Prometheus/Grafana REST API、调用外部 Webhook、抓取数据等场景。
 */
import { tool } from "ai";
import { z } from "zod/v4";

const HTTP_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB

export const httpRequest = tool({
  description:
    "发起通用 HTTP 请求，支持 GET/POST/PUT/DELETE/PATCH 方法。用于调用外部 REST API（如 Prometheus/Grafana）、抓取网页数据、触发 Webhook 等场景。响应体限制 1MB，超时 10 秒。",
  parameters: z.object({
    url: z
      .string()
      .describe(
        "完整的请求 URL，例如 'http://prometheus:9090/api/v1/query'"
      ),
    method: z
      .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
      .default("GET")
      .describe("HTTP 方法，默认 GET"),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("自定义请求头"),
    body: z.string().optional().describe("请求体（字符串），POST/PUT/PATCH 时使用"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({
    url,
    method = "GET",
    headers,
    body,
  }: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<string> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Aura-Agent/0.1",
          ...headers,
        },
        body: method !== "GET" ? body : undefined,
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeout);

      const contentType = response.headers.get("content-type") || "";
      let responseBody = "";

      if (
        contentType.includes("application/json") ||
        contentType.includes("text/")
      ) {
        const text = await response.text();
        responseBody = text.slice(0, MAX_RESPONSE_BYTES);
      } else {
        responseBody = `[非文本响应: ${contentType}, ${response.headers.get("content-length") ?? "未知"} bytes]`;
      }

      const truncated = responseBody.length >= MAX_RESPONSE_BYTES;

      return JSON.stringify({
        status: response.ok ? "success" : "error",
        httpStatus: response.status,
        url,
        method,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        truncated,
        ...(truncated && {
          warning: `响应体已截断至 ${MAX_RESPONSE_BYTES / 1024}KB`,
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";

      if (message.includes("abort")) {
        return JSON.stringify({
          status: "timeout",
          url,
          method,
          error: `HTTP 请求超时 (${HTTP_TIMEOUT_MS / 1000}s)`,
        });
      }

      return JSON.stringify({
        status: "error",
        url,
        method,
        error: `http_request 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
