"use client";

/**
 * 配额调整弹出面板
 *
 * 从 AI 控制台 WS 标签点击打开，显示今日用量 + 配额调整。
 */
import React, { useState, useEffect, useCallback } from "react";

interface QuotaInfo {
  dailyTokenLimit: number;
  isCustom: boolean;
  todayUsed: number;
  todayRemaining: number;
  usageRatio: number;
}

interface QuotaPopoverProps {
  workspaceId: string;
  workspaceLabel: string; // "WS: ec59c0c1..."
}

export function QuotaPopover({ workspaceId, workspaceLabel }: QuotaPopoverProps) {
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchQuota = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/quota?workspaceId=${workspaceId}`);
      const data = await res.json();
      if (data.code === 200) {
        setQuota(data.data);
        setNewLimit(String(data.data.dailyTokenLimit));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      fetchQuota();
    }
  }, [open, fetchQuota]);

  const handleSave = async () => {
    const num = parseInt(newLimit, 10);
    if (!num || num < 10000) {
      setMessage("最低 10,000");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspaces/quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, dailyTokenLimit: num }),
      });
      const data = await res.json();
      if (data.code === 200) {
        setQuota((prev) =>
          prev
            ? { ...prev, dailyTokenLimit: num, isCustom: true, todayRemaining: Math.max(0, num - prev.todayUsed), usageRatio: num > 0 ? prev.todayUsed / num : 0 }
            : null
        );
        setEditing(false);
        setMessage("已更新");
        setTimeout(() => setMessage(""), 2000);
      } else {
        setMessage(data.message ?? "保存失败");
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/workspaces/quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, dailyTokenLimit: null }),
      });
      const data = await res.json();
      if (data.code === 200) {
        await fetchQuota();
        setEditing(false);
        setMessage("已恢复默认");
        setTimeout(() => setMessage(""), 2000);
      } else {
        setMessage(data.message ?? "操作失败");
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setSaving(false);
    }
  };

  const pct = quota ? Math.min(100, Math.round(quota.usageRatio * 100)) : 0;
  const barColor =
    pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <span className="relative">
      {/* 触发器 */}
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-aura-text-muted hover:text-emerald-400 transition-colors cursor-pointer whitespace-nowrap"
        title="点击查看配额"
      >
        {workspaceLabel}
      </button>

      {/* 弹出面板 */}
      {open && (
        <>
          {/* 遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setEditing(false);
            }}
          />
          {/* 面板 */}
          <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-aura-surface border border-aura-border rounded-xl shadow-2xl p-4">
            {/* 标题 */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-aura-text">📊 今日配额</h4>
              {quota?.isCustom && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  自定义
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-4 w-4 border border-aura-border border-t-emerald-400" />
              </div>
            ) : quota ? (
              <>
                {/* 进度条 */}
                <div className="mb-2">
                  <div className="flex justify-between text-[10px] text-aura-text-muted mb-1">
                    <span>已用 {quota.todayUsed.toLocaleString()}</span>
                    <span>上限 {quota.dailyTokenLimit.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-aura-bg rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-right text-[10px] text-aura-text-dim mt-0.5">
                    {pct}% · 剩余 {quota.todayRemaining.toLocaleString()}
                  </div>
                </div>

                {/* 配额调整 */}
                {editing ? (
                  <div className="space-y-2 mt-3 pt-3 border-t border-aura-border">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={newLimit}
                        onChange={(e) => setNewLimit(e.target.value)}
                        className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text focus:outline-none focus:border-emerald-500/50"
                        placeholder="500000"
                        min={10000}
                        max={5000000}
                        step={100000}
                      />
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                      >
                        {saving ? "..." : "确定"}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleReset}
                        disabled={saving}
                        className="text-[10px] text-aura-text-muted hover:text-amber-400 transition-colors"
                      >
                        恢复默认
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        className="text-[10px] text-aura-text-muted hover:text-aura-text transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-aura-border">
                    <button
                      onClick={() => setEditing(true)}
                      className="w-full text-xs text-aura-text-muted hover:text-emerald-400 bg-aura-bg hover:bg-aura-hover border border-aura-border rounded-lg px-3 py-1.5 transition-colors"
                    >
                      {quota.isCustom ? "调整配额" : "自定义配额"}
                    </button>
                  </div>
                )}

                {/* 操作提示 */}
                {quota.todayRemaining <= 0 && !editing && (
                  <p className="text-[10px] text-red-400 mt-2">
                    ⚠️ 配额已用尽，点击上方按钮调高上限
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-aura-text-muted text-center py-4">
                无法获取配额信息
              </p>
            )}

            {/* 保存消息 */}
            {message && (
              <p className={`text-[10px] mt-2 ${
                message === "已更新" || message === "已恢复默认" || message === "连接成功"
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}>
                {message}
              </p>
            )}
          </div>
        </>
      )}
    </span>
  );
}
