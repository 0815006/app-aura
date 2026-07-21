/**
 * Aura 统一 API 请求封装（双端自适应）
 *
 * 核心逻辑：
 * - 服务端模式 (AURA_MODE=server)：直接请求本地 /api/* 路由，走 Cookie 认证
 * - 客户端模式 (AURA_MODE=client)：自动转发到服务端地址，走 Authorization: Bearer 认证
 *
 * 客户端支持运行时切换服务端地址（通过 StatusBar 点击），
 * 地址优先级：localStorage 自定义 > 构建时默认 __AURA_SERVER_URL__ > localhost:8086。
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
 */
function getBaseUrl(): string {
  return getServerUrl();
}

/**
 * 获取认证 token（客户端模式从 localStorage 读取）
 */
const TOKEN_KEY = "aura-auth-token";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
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
  const isClient = getAuraMode() === "client";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  // 客户端模式：注入 Authorization: Bearer <token>
  if (isClient) {
    const token = getAuthToken();
    if (token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(fullUrl, {
      headers,
      credentials: isClient ? "include" : "same-origin",
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
