/**
 * Aura 统一 API 请求封装（双端自适应）
 *
 * 核心逻辑：
 * - 服务端模式 (AURA_MODE=server)：直接请求本地 /api/* 路由
 * - 客户端模式 (AURA_MODE=client)：自动将 /api/* 请求转发到服务端地址
 *
 * ★ Phase 8: 客户端模式自动注入 X-Aura-Local-Key header
 *
 * 所有前端 REST 接口统一走此模块，禁止直接使用裸 fetch。
 */

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

/**
 * 客户端模型配置（本地存储，不经服务端 DB）
 */
export interface LocalModelConfig {
  id: string;
  label: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
  isDefault: boolean;
  createdAt: string;
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
      return (win.__AURA_SERVER_URL__ as string) || "http://localhost:8086";
    }
    return "http://localhost:8086";
  }
  return "";
}

// ============================================================
// ★ Phase 8: 本地模型配置管理 (localStorage)
// ============================================================

const LOCAL_CONFIGS_KEY = "aura_local_model_configs";
const LOCAL_ACTIVE_CONFIG_KEY = "aura_active_model_config_id";

/** 获取客户端本地所有模型配置 */
export function getLocalModelConfigs(): LocalModelConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_CONFIGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存客户端本地模型配置 */
export function saveLocalModelConfig(config: LocalModelConfig): void {
  if (typeof window === "undefined") return;
  const configs = getLocalModelConfigs();
  const idx = configs.findIndex((c) => c.id === config.id);

  if (config.isDefault) {
    // 取消其他默认
    configs.forEach((c) => (c.isDefault = false));
  }

  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }

  localStorage.setItem(LOCAL_CONFIGS_KEY, JSON.stringify(configs));
}

/** 删除客户端本地模型配置 */
export function deleteLocalModelConfig(id: string): void {
  if (typeof window === "undefined") return;
  const configs = getLocalModelConfigs().filter((c) => c.id !== id);
  localStorage.setItem(LOCAL_CONFIGS_KEY, JSON.stringify(configs));

  // 如果删的是活跃的，清除活跃标记
  const activeId = getActiveLocalConfigId();
  if (activeId === id) {
    localStorage.removeItem(LOCAL_ACTIVE_CONFIG_KEY);
  }
}

/** 获取当前激活的本地模型配置 ID */
export function getActiveLocalConfigId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LOCAL_ACTIVE_CONFIG_KEY);
}

/** 设置当前激活的本地模型配置 ID */
export function setActiveLocalConfigId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_ACTIVE_CONFIG_KEY, id);
}

/** 获取当前激活的完整本地模型配置 */
export function getActiveLocalConfig(): LocalModelConfig | null {
  const activeId = getActiveLocalConfigId();
  if (!activeId) {
    // 返回默认项
    const configs = getLocalModelConfigs();
    return configs.find((c) => c.isDefault) ?? configs[0] ?? null;
  }
  return getLocalModelConfigs().find((c) => c.id === activeId) ?? null;
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
  const mode = getAuraMode();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  // ★ Phase 8: 客户端模式自动注入 X-Aura-Local-Key + 模型配置
  if (mode === "client" && url === "/api/chat") {
    const activeConfig = getActiveLocalConfig();
    if (activeConfig) {
      headers["x-aura-local-key"] = activeConfig.apiKey;
    }
  }

  try {
    const response = await fetch(fullUrl, {
      headers,
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
