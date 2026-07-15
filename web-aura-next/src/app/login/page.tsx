"use client";

/**
 * 登录页面
 *
 * 极简暗色风格表单，服务端模式下未登录自动跳转至此页。
 */
import React, { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = isRegister
        ? await register(username, password, displayName || undefined)
        : await login(username, password);

      if (result.success) {
        router.push("/");
      } else {
        setError(result.message);
      }
    } catch {
      setError("操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl">🧠</span>
          <h1 className="text-3xl font-bold text-emerald-400 mt-3">Aura</h1>
          <p className="text-slate-500 text-sm mt-2">
            多场景通用智能体工作台
          </p>
        </div>

        {/* 表单 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <h2 className="text-lg font-semibold text-slate-100 mb-6">
            {isRegister ? "创建账号" : "登录"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            {isRegister && (
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">
                  显示名称（可选）
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="给自己起个名字"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? "至少 6 位密码" : "请输入密码"}
                required
                minLength={isRegister ? 6 : undefined}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed mt-6"
            >
              {loading ? "处理中..." : isRegister ? "注册" : "登录"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
              }}
              className="text-sm text-slate-500 hover:text-emerald-400 transition-colors"
            >
              {isRegister ? "已有账号？去登录" : "没有账号？注册一个"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Aura v0.1.0 · 开放注册 · 极简账户系统
        </p>
      </div>
    </div>
  );
}
