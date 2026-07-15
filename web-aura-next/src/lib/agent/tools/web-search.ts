/**
 * 实时联网搜索 —— web_search
 *
 * 调用搜索引擎 API（Bing Search API v7），返回前 N 条结果摘要。
 * 通过环境变量 BING_SEARCH_API_KEY 配置。
 */
import { tool } from "ai";
import { z } from "zod/v4";

const SEARCH_TIMEOUT_MS = 10_000;

export const webSearch = tool({
  description:
    "实时联网搜索，返回前 N 条结果的标题、URL 和摘要。用于获取最新信息、查资料、验证事实等场景。需要配置 BING_SEARCH_API_KEY 或 SEARCH_API_ENDPOINT 环境变量。",
  parameters: z.object({
    query: z.string().describe("搜索关键词或问句"),
    count: z
      .number()
      .int()
      .positive()
      .max(10)
      .default(5)
      .describe("返回结果数量，默认 5，最大 10"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async ({
    query,
    count = 5,
  }: {
    query: string;
    count?: number;
  }): Promise<string> => {
    try {
      const apiKey = process.env.BING_SEARCH_API_KEY;
      if (!apiKey) {
        return JSON.stringify({
          status: "warning",
          query,
          results: [],
          error:
            "未配置 BING_SEARCH_API_KEY 环境变量，无法执行联网搜索。请配置后重试。",
        });
      }

      const endpoint =
        process.env.BING_SEARCH_ENDPOINT ||
        "https://api.bing.microsoft.com/v7.0/search";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

      const response = await fetch(
        `${endpoint}?q=${encodeURIComponent(query)}&count=${count}&mkt=zh-CN`,
        {
          headers: {
            "Ocp-Apim-Subscription-Key": apiKey,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        return JSON.stringify({
          status: "error",
          query,
          error: `搜索 API 返回错误: HTTP ${response.status}`,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await response.json()) as any;

      const results =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.webPages?.value?.map((item: any) => ({
          title: item.name,
          url: item.url,
          snippet: item.snippet,
        })) ?? [];

      return JSON.stringify({
        status: "success",
        query,
        totalResults: results.length,
        results,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        query,
        error: `web_search 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
