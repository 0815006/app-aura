"use client";

/**
 * 数据库连接下拉选择器
 *
 * 在下拉列表中显示用户所有数据库连接，支持选择、测试连接快速按钮，
 * 以及打开管理面板入口。
 * 参考 ModelSwitcher 的下拉模式。
 */
import React, { useState, useEffect, useCallback } from "react";
import { auraFetch } from "@/lib/api-client";
import type { DbConnectionItem } from "@/lib/agent/scene-data";

interface DbConnectionSelectorProps {
  selectedConnectionId: string | null;
  onSelect: (connection: DbConnectionItem | null) => void;
  onOpenPanel: () => void;
  disabled?: boolean;
}

export function DbConnectionSelector({
  selectedConnectionId,
  onSelect,
  onOpenPanel,
  disabled,
}: DbConnectionSelectorProps) {
  const [connections, setConnections] = useState<DbConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadConnections = useCallback(async () => {
    try {
      const res = await auraFetch("/api/db-connections");
      const data = await res.json();
      if (data.code === 200 && data.data?.connections) {
        setConnections(data.data.connections);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections, refreshKey]);

  // 外部刷新
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 暴露刷新方法
  useEffect(() => {
    // 通过 DOM 事件暴露刷新
    const handler = () => handleRefresh();
    window.addEventListener("db-connections-changed", handler);
    return () => window.removeEventListener("db-connections-changed", handler);
  }, [handleRefresh]);

  // 当前选中的连接
  const selected = connections.find((c) => c.id === selectedConnectionId) ?? null;

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-1.5 bg-aura-hover hover:bg-aura-border border border-aura-border rounded-lg text-xs text-aura-text transition-colors ${
          disabled ? "opacity-40 cursor-not-allowed" : ""
        }`}
        title="选择数据库连接"
      >
        <svg
          className="w-4 h-4 flex-shrink-0 text-aura-text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"
          />
          <circle cx="12" cy="12" r="2" strokeWidth={1.5} />
          <path d="M4 7h16" strokeWidth={1.5} />
          <circle cx="7" cy="7" r="1" fill="currentColor" />
          <circle cx="9.5" cy="7" r="1" fill="currentColor" />
        </svg>

        {loading ? (
          <span className="text-aura-text-muted">加载中...</span>
        ) : selected ? (
          <>
            {/* 状态指示器 */}
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                selected.testResult === "success"
                  ? "bg-emerald-400"
                  : selected.testResult === "failed"
                    ? "bg-red-400"
                    : "bg-aura-text-dim"
              }`}
            />
            <span className="text-cyan-400 font-medium max-w-[100px] truncate">
              {selected.label}
            </span>
          </>
        ) : connections.length > 0 ? (
          <span className="text-aura-text-muted">选择数据库连接</span>
        ) : (
          <span className="text-aura-text-muted">无可用连接</span>
        )}

        <svg
          className={`w-3 h-3 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {open && (
        <>
          {/* 点击遮罩关闭 */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-20 w-72 bg-aura-hover border border-aura-border rounded-lg shadow-xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto py-1">
              {/* 管理连接入口 */}
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenPanel();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-aura-text-secondary hover:bg-aura-border hover:text-aura-text transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                管理数据库连接...
              </button>

              {/* 分隔线 */}
              {connections.length > 0 && (
                <div className="border-t border-aura-border my-1" />
              )}

              {/* 连接列表 */}
              {connections.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => {
                    onSelect(conn);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedConnectionId === conn.id
                      ? "bg-cyan-600/20 text-cyan-400"
                      : "text-aura-text-secondary hover:bg-aura-border hover:text-aura-text"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        conn.testResult === "success"
                          ? "bg-emerald-400"
                          : conn.testResult === "failed"
                            ? "bg-red-400"
                            : "bg-aura-text-dim"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{conn.label}</div>
                      <div className="text-xs text-aura-text-muted truncate">
                        {conn.host}:{conn.port}/{conn.dbName}
                      </div>
                    </div>
                    <span className="text-[10px] text-aura-text-dim bg-aura-border rounded px-1 py-0.5 flex-shrink-0">
                      {conn.dbType}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
