/**
 * Aura 统一 API 请求封装（双端自适应）
 *
 * 核心逻辑：
 * - 服务端模式 (AURA_MODE=server)：直接请求本地 /api/* 路由
 * - 客户端模式 (AURA_MODE=client)：自动将 /api/* 请求转发到服务端地址
 *
 * 客户端支持运行时切换服务端地址（通过 StatusBar 点击），
 * 地址优先级：localStorage 自定义 > 构建时默认 __AURA_SERVER_URL__ > localhost:8086。
 *
 * 客户端与服务端使用统一的 JWT 认证（Cookie），模型配置由服务端 /api/models 管理。
 *
 * 所有前端 REST 接口统一走此模块，禁止直接使用裸 fetch。
 */

import { getServerUrl, getAuraMode } from "./server-url";

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

/**
 * 获取 API 基础 URL
 * 客户端模式指向远程服务端（优先读 localStorage 自定义地址），
 * 服务端模式使用相对路径。
 */
function getBaseUrl(): string {
  return getServerUrl();
}

// ============================================================
// 请求核心
// ============================================================

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const baseUrl = getBaseUrl();
  const fullUrl = `${baseUrl}${url}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(fullUrl, {
      headers,
      credentials: "include", // 携带 Cookie（JWT）
      ...options,
    });

    if (!response.ok) {
      return {
        code: response.status,
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // 流式响应不解析 JSON
    const contentType = response.headers.get("content-type") || "";
    if (
      contentType.includes("text/plain") ||
      contentType.includes("text/event-stream")
    ) {
      return {
        code: 200,
        message: "streaming",
        data: response as unknown as T,
      };
    }

    const json = (await response.json()) as ApiResponse<T>;
    return json;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "网络请求失败";
    return {
      code: -1,
      message: `请求异常: ${errorMessage}`,
    };
  }
}

export const api = {
  get<T>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url, { method: "GET" });
  },

  post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>(url, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(url: string): Promise<ApiResponse<T>> {
    return request<T>(url, { method: "DELETE" });
  },
};

export type { ApiResponse as ApiResponseType };
