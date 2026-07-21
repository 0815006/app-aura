"use client";

/**
 * Aura Auth Context
 *
 * 提供全局认证状态：user, login(), register(), logout(), isLoading
 * 启动时从 /api/auth/me 恢复登录态。
 *
 * 双端认证策略：
 * - 服务端模式（浏览器 ~ 同源）：Cookie (aura_token, SameSite=Lax, HttpOnly)
 * - 客户端模式（Tauri ~ 跨协议 tauri:// → http://）：Authorization: Bearer <token>
 *   Cookie 在跨协议场景下 SameSite=Lax 不生效，SameSite=None 又需要 HTTPS，
 *   因此客户端模式改用 localStorage 存 JWT，每次通过 Authorization header 发送。
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { hashPasswordClient } from "@/lib/auth/client-hash";
import { getServerUrl, getAuraMode } from "@/lib/server-url";

// ============================================================
// Token 存储（客户端模式专用）
// ============================================================

const TOKEN_KEY = "aura-auth-token";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 静默
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 静默
  }
}

// ============================================================
// API 路径拼接 + 认证请求头
// ============================================================

function getAuthUrl(path: string): string {
  const base = getServerUrl();
  return base ? `${base}${path}` : path;
}

/**
 * 构建 auth 请求的 headers
 *
 * 客户端模式：Authorization: Bearer <token>
 * 服务端模式：无额外 headers（走 Cookie）
 */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (getAuraMode() === "client") {
    const token = getStoredToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  return headers;
}

// ============================================================
// 类型定义
// ============================================================

export interface UserInfo {
  id: number;
  username: string;
  displayName: string | null;
}

interface AuthContextType {
  user: UserInfo | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (username: string, password: string, displayName?: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({ success: false, message: "未初始化" }),
  register: async () => ({ success: false, message: "未初始化" }),
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ============================================================
// Provider
// ============================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isClient = getAuraMode() === "client";

  // 启动时恢复登录态
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const res = await fetch(getAuthUrl("/api/auth/me"), {
          headers: authHeaders(),
          credentials: isClient ? "include" : "same-origin",
        });
        const data = await res.json();
        if (data.code === 200 && data.data) {
          setUser(data.data);
        } else {
          // 服务端拒绝 → 清除可能过期的 token
          if (isClient) clearStoredToken();
        }
      } catch {
        // 网络错误，静默保留 token 以便重试
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const hashed = await hashPasswordClient(password);
        const res = await fetch(getAuthUrl("/api/auth/login"), {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ username, password: hashed }),
          credentials: isClient ? "include" : "same-origin",
        });
        const data = await res.json();
        if (data.code === 200 && data.data?.user) {
          // 客户端模式：存 token 到 localStorage
          if (isClient && data.data.token) {
            setStoredToken(data.data.token);
          }
          setUser(data.data.user);
          return { success: true, message: "登录成功" };
        }
        return { success: false, message: data.message || "登录失败" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "网络错误";
        return { success: false, message };
      }
    },
    [isClient]
  );

  const register = useCallback(
    async (username: string, password: string, displayName?: string) => {
      try {
        const hashed = await hashPasswordClient(password);
        const res = await fetch(getAuthUrl("/api/auth/register"), {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ username, password: hashed, displayName }),
          credentials: isClient ? "include" : "same-origin",
        });
        const data = await res.json();
        if (data.code === 200 && data.data?.user) {
          if (isClient && data.data.token) {
            setStoredToken(data.data.token);
          }
          setUser(data.data.user);
          return { success: true, message: "注册成功" };
        }
        return { success: false, message: data.message || "注册失败" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "网络错误";
        return { success: false, message };
      }
    },
    [isClient]
  );

  const logout = useCallback(async () => {
    try {
      await fetch(getAuthUrl("/api/auth/logout"), {
        method: "POST",
        headers: authHeaders(),
        credentials: isClient ? "include" : "same-origin",
      });
    } catch {
      // 忽略网络错误
    }
    if (isClient) clearStoredToken();
    setUser(null);
  }, [isClient]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
