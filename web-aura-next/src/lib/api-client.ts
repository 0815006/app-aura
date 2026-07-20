/**
 * Aura 统一 API 请求封装（双端自适应）
 *
 * 核心逻辑：
 * - 服务端模式 (AURA_MODE=server)：直接请求本地 /api/* 路由
 * - 客户端模式 (AURA_MODE=client)：自动将 /api/* 请求转发到服务端地址
 *
 * 客户端与服务端使用统一的 JWT 认证（Cookie），模型配置由服务端 /api/models 管理。
 *
 * 所有前端 REST 接口统一走此模块，禁止直接使用裸 fetch。
 */

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

/**
 * 获取当前运行模式
 * 客户端通过全局变量 __AURA_MODE__ 判断，服务端通过 process.env 判断。
 */
function getAuraMode(): "server" | "client" {
  if (typeof window !== "undefined") {
    const win = window as unknown as Record<string, unknown>;
    if (win.__AURA_MODE__) {
      return win.__AURA_MODE__ as "server" | "client";
    }
  }
  if (typeof process !== "undefined" && process.env.AURA_MODE) {
    return process.env.AURA_MODE as "server" | "client";
  }
  return "server";
}

/**
 * 获取 API 基础 URL
 * 客户端模式指向远程服务端，服务端模式使用相对路径。
 */
function getBaseUrl(): string {
  const mode = getAuraMode();
  if (mode === "client") {
    if (typeof window !== "undefined") {
      const win = window as unknown as Record<string, unknown>;
      return (win.__AURA_SERVER_URL__ as string) || (process.env.AURA_SERVER_URL as string) || "http://localhost:8086";
    }
    return "http://localhost:8086";
  }
  return "";
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
