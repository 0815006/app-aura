"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getServerUrl,
  setServerUrl,
  resetServerUrl,
  getDefaultServerUrl,
  hasCustomServerUrl,
} from "@/lib/server-url";

interface Props {
  open: boolean;
  onClose: () => void;
  onUrlChanged: () => void;
}

export function ServerUrlDialog({ open, onClose, onUrlChanged }: Props) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // 每次打开弹窗时同步当前地址
  useEffect(() => {
    if (open) {
      setInput(getServerUrl());
      setError(null);
      setTestResult(null);
    }
  }, [open]);

  // 输入框变化时清除之前的错误和测试结果
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
      setError(null);
      setTestResult(null);
    },
    []
  );

  // 保存
  const handleSave = useCallback(() => {
    setSaving(true);
    setError(null);

    const result = setServerUrl(input);
    if (!result.ok) {
      setError(result.error ?? "保存失败");
      setSaving(false);
      return;
    }

    setSaving(false);
    onUrlChanged();
  }, [input, onUrlChanged]);

  // 测试连接
  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const url = input.trim().replace(/\/+$/, "");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${url}/api/health`, {
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        setTestResult({
          ok: true,
          message: `连接成功 — 服务器时间: ${data.timestamp ?? "N/A"}`,
        });
      } else {
        setTestResult({
          ok: false,
          message: `服务器返回错误: HTTP ${res.status}`,
        });
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "连接超时（5 秒），请检查地址是否正确"
          : err instanceof Error
            ? err.message
            : "网络请求失败";
      setTestResult({ ok: false, message: `无法连接: ${msg}` });
    } finally {
      setTesting(false);
    }
  }, [input]);

  // 恢复默认
  const handleReset = useCallback(() => {
    resetServerUrl();
    setInput(getDefaultServerUrl());
    setError(null);
    setTestResult(null);
    onUrlChanged();
  }, [onUrlChanged]);

  if (!open) return null;

  const isCustom = hasCustomServerUrl();
  const currentUrl = getServerUrl();

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗 */}
      <div className="fixed bottom-10 left-5 z-50 w-96 bg-aura-surface border border-aura-border rounded-xl shadow-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-aura-border bg-aura-bg">
          <h3 className="text-sm font-semibold text-aura-text flex items-center gap-2">
            <span className="text-base">🔗</span>
            服务端连接设置
          </h3>
          <button
            onClick={onClose}
            className="text-aura-text-muted hover:text-aura-text transition-colors text-sm leading-none"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="px-4 py-3 space-y-3">
          {/* 输入框 */}
          <div>
            <label className="text-[10px] text-aura-text-dim uppercase tracking-wider mb-1 block">
              服务端地址
            </label>
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onClose();
              }}
              placeholder="http://192.168.1.100:8086"
              className="w-full bg-aura-bg border border-aura-border rounded-lg px-3 py-2 text-xs text-aura-text font-mono focus:outline-none focus:border-emerald-500/50 transition-colors"
              autoFocus
            />
            {error && (
              <p className="text-[10px] text-red-400 mt-1">{error}</p>
            )}
          </div>

          {/* 自定义标记 */}
          {isCustom && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
              使用自定义地址 · 默认地址: {getDefaultServerUrl()}
            </div>
          )}

          {/* 测试结果 */}
          {testResult && (
            <div
              className={`text-[10px] rounded-lg px-2.5 py-2 flex items-start gap-1.5 ${
                testResult.ok
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              <span className="flex-shrink-0 mt-px">
                {testResult.ok ? "✅" : "❌"}
              </span>
              <span>{testResult.message}</span>
            </div>
          )}

          {/* 按钮行 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-aura-bg border border-aura-border text-aura-text hover:border-aura-border-light disabled:opacity-50 transition-colors"
            >
              {testing ? (
                <span className="inline-flex items-center gap-1">
                  <span className="animate-spin inline-block w-2.5 h-2.5 border border-aura-text-muted border-t-transparent rounded-full" />
                  测试中...
                </span>
              ) : (
                "测试连接"
              )}
            </button>
            <button
              onClick={handleReset}
              disabled={!isCustom}
              className="px-3 py-1.5 text-xs rounded-lg text-aura-text-muted hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="恢复为构建时默认地址"
            >
              重置
            </button>
          </div>

          {/* 当前生效地址提示 */}
          <p className="text-[9px] text-aura-text-dim">
            当前生效:{" "}
            <code className="text-aura-text-muted bg-aura-bg px-1 py-0.5 rounded">
              {currentUrl}
            </code>
            <br />
            切换地址后会自动重新检测连接状态
          </p>
        </div>
      </div>
    </>
  );
}
