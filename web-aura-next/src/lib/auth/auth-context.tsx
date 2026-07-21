"use client";

/**
 * Aura Auth Context
 *
 * 提供全局认证状态：user, login(), register(), logout(), isLoading
 * 启动时从 /api/auth/me 恢复登录态。
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

// ============================================================
// 客户端模式 API 路径适配
// ============================================================

/**
 * 获取完整的 API 路径
 *
 * - 服务端模式（浏览器直连）：直接返回相对路径
 * - 客户端模式（Tauri 桌面端）：拼接完整服务端地址
 *   因为打包后前端从 tauri://localhost 加载，相对路径到不了服务器
 */
function getAuthUrl(path: string): string {
  if (typeof window !== "undefined") {
    const win = window as unknown as Record<string, unknown>;
    if (win.__AURA_MODE__ === "client") {
      const serverUrl =
        (win.__AURA_SERVER_URL__ as string) || "http://localhost:8086";
      return `${serverUrl}${path}`;
    }
  }
  return path;
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

  // 启动时从 /api/auth/me 恢复登录态
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const res = await fetch(getAuthUrl("/api/auth/me"));
        const data = await res.json();
        if (data.code === 200 && data.data) {
          setUser(data.data);
        }
      } catch {
        // 未登录或网络错误，静默处理
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const hashed = await hashPasswordClient(password);
        const res = await fetch(getAuthUrl("/api/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: hashed }),
        });
        const data = await res.json();
        if (data.code === 200 && data.data?.user) {
          setUser(data.data.user);
          return { success: true, message: "登录成功" };
        }
        return { success: false, message: data.message || "登录失败" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "网络错误";
        return { success: false, message };
      }
    },
    []
  );

  const register = useCallback(
    async (username: string, password: string, displayName?: string) => {
      try {
        const hashed = await hashPasswordClient(password);
        const res = await fetch(getAuthUrl("/api/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: hashed, displayName }),
        });
        const data = await res.json();
        if (data.code === 200 && data.data?.user) {
          setUser(data.data.user);
          return { success: true, message: "注册成功" };
        }
        return { success: false, message: data.message || "注册失败" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "网络错误";
        return { success: false, message };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch(getAuthUrl("/api/auth/logout"), { method: "POST" });
    } catch {
      // 忽略网络错误
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
