/**
 * 服务端地址管理（客户端运行时切换）
 *
 * 优先级链：
 *   localStorage("aura-server-url") > window.__AURA_SERVER_URL__ > "http://localhost:8086"
 *
 * - 客户端模式 (AURA_MODE=client)：用户可以运行时点击 StatusBar 修改服务器地址，
 *   修改后写入 localStorage，所有 API 请求自动指向新地址。
 * - 服务端模式 (AURA_MODE=server)：始终使用空字符串（相对路径），不做 localStorage 读写。
 */
const STORAGE_KEY = "aura-server-url";

/**
 * 获取当前生效的服务端地址
 *
 * 客户端模式返回完整 URL（如 http://192.168.1.100:8086），
 * 服务端模式返回空字符串（相对路径）。
 */
export function getServerUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const win = window as unknown as Record<string, unknown>;

  // 服务端模式：不读 localStorage，返回空字符串走相对路径
  if (win.__AURA_MODE__ !== "client") {
    return "";
  }

  // 客户端模式：优先读 localStorage 中的用户自定义地址
  try {
    const custom = localStorage.getItem(STORAGE_KEY);
    if (custom) {
      // 简单去空白，防止用户误输入首尾空格
      return custom.trim().replace(/\/+$/, ""); // 去掉末尾多余斜杠
    }
  } catch {
    // localStorage 不可用时静默回退
  }

  // fallback 到构建时注入的默认值
  if (win.__AURA_SERVER_URL__) {
    const url = (win.__AURA_SERVER_URL__ as string).trim().replace(/\/+$/, "");
    if (url) return url;
  }

  // 最终兜底
  return "http://localhost:8086";
}

/**
 * 设置自定义服务端地址
 *
 * @param url 完整的服务端地址，如 http://192.168.1.100:8086
 * @returns { ok: true } 成功，{ ok: false, error: "..." } 格式校验失败
 */
export function setServerUrl(url: string): { ok: boolean; error?: string } {
  const trimmed = url.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return { ok: false, error: "地址不能为空" };
  }

  // URL 格式校验
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "地址格式不正确，示例: http://192.168.1.100:8086",
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      ok: false,
      error: "地址必须以 http:// 或 https:// 开头",
    };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "请输入有效的服务器主机名或 IP" };
  }

  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
    return { ok: true };
  } catch {
    return { ok: false, error: "存储失败，请检查浏览器存储空间" };
  }
}

/**
 * 恢复为构建时默认地址（清除 localStorage 中的自定义值）
 */
export function resetServerUrl(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默忽略
  }
}

/**
 * 当前是否有用户自定义的服务端地址
 */
export function hasCustomServerUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * 获取构建时默认地址（即恢复默认后的值）
 */
export function getDefaultServerUrl(): string {
  if (typeof window === "undefined") return "";

  const win = window as unknown as Record<string, unknown>;
  if (win.__AURA_SERVER_URL__) {
    const url = (win.__AURA_SERVER_URL__ as string).trim().replace(/\/+$/, "");
    if (url) return url;
  }
  return "http://localhost:8086";
}

/**
 * 获取当前模式（暴露给不需要完整 getAuraMode 的地方）
 */
export function getAuraMode(): "server" | "client" {
  if (typeof window !== "undefined") {
    const win = window as unknown as Record<string, unknown>;
    if (win.__AURA_MODE__ === "client") return "client";
  }
  return "server";
}
