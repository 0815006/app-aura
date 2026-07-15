"use client";

/**
 * 模型选择器组件
 *
 * 位于聊天输入区上方，下拉列出用户所有模型配置。
 * 选中项高亮，切换时更新全局状态。
 */
import React, { useState, useEffect, useCallback } from "react";

// ============================================================
// 类型定义
// ============================================================

export interface ModelConfigSafe {
  id: string;
  label: string;
  modelName: string;
  baseUrl: string | null;
  isDefault: boolean | null;
}

interface ModelSwitcherProps {
  selectedConfigId: string | null;
  onSelect: (config: ModelConfigSafe | null) => void;
}

// ============================================================
// 组件
// ============================================================

export function ModelSwitcher({ selectedConfigId, onSelect }: ModelSwitcherProps) {
  const [configs, setConfigs] = useState<ModelConfigSafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // 加载模型配置列表
  const loadConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      if (data.code === 200 && Array.isArray(data.data)) {
        setConfigs(data.data);
        // 自动选中默认项
        if (!selectedConfigId) {
          const defaultCfg = data.data.find(
            (c: ModelConfigSafe) => c.isDefault
          );
          if (defaultCfg) {
            onSelect(defaultCfg);
          } else if (data.data.length > 0) {
            onSelect(data.data[0]);
          }
        }
      }
    } catch {
      // 忽略加载失败
    } finally {
      setLoading(false);
    }
  }, [selectedConfigId, onSelect]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // 当前选中的配置
  const selected = configs.find((c) => c.id === selectedConfigId) ?? null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-300 transition-colors"
        title="切换模型"
      >
        <span className="text-slate-500">🤖</span>
        {loading ? (
          <span className="text-slate-500">加载中...</span>
        ) : selected ? (
          <>
            <span className="text-emerald-400 font-medium">
              {selected.label}
            </span>
            <span className="text-slate-500">({selected.modelName})</span>
          </>
        ) : (
          <span className="text-slate-500">环境变量默认模型</span>
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
          <div className="absolute top-full left-0 mt-1 z-20 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto py-1">
              {/* 无模型配置选项 */}
              <button
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  !selectedConfigId
                    ? "bg-emerald-600/20 text-emerald-400"
                    : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                }`}
              >
                <span className="text-slate-500">默认</span>
                <span className="text-xs text-slate-500 ml-2">
                  使用环境变量模型
                </span>
              </button>

              {/* 分隔线 */}
              {configs.length > 0 && (
                <div className="border-t border-slate-700 my-1" />
              )}

              {/* 用户配置列表 */}
              {configs.map((cfg) => (
                <button
                  key={cfg.id}
                  onClick={() => {
                    onSelect(cfg);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedConfigId === cfg.id
                      ? "bg-emerald-600/20 text-emerald-400"
                      : "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{cfg.label}</span>
                    {cfg.isDefault && (
                      <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        默认
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">{cfg.modelName}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
