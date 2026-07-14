/**
 * Aura 统一 API 请求封装
 * 所有前端 REST 接口统一走此模块，禁止直接使用裸 fetch。
 */

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

const BASE_URL = "";

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    return {
      code: response.status,
      message: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const json = (await response.json()) as ApiResponse<T>;
  return json;
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

export type { ApiResponse };
