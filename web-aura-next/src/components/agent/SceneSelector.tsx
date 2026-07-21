"use client";

/**
 * 场景选择器模态框
 *
 * 卡片网格展示所有 active 场景，用户点击选择后回调父组件。
 * 参考 ModelConfigPanel 的模态框模式。
 */
import React, { useState, useEffect, useCallback } from "react";
import { auraFetch } from "@/lib/api-client";
import type { SceneListItem } from "@/lib/agent/scene-data";

interface SceneSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (scene: SceneListItem) => void;
}

export function SceneSelector({ open, onClose, onSelect }: SceneSelectorProps) {
  const [scenes, setScenes] = useState<SceneListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadScenes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auraFetch("/api/scenes");
      const data = await res.json();
      if (data.code === 200 && data.data?.scenes) {
        setScenes(data.data.scenes);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadScenes();
    }
  }, [open, loadScenes]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
        onClick={onClose}
      >
        {/* 模态框 */}
        <div
          className="bg-aura-surface border border-aura-border rounded-xl shadow-2xl w-[560px] max-h-[70vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-aura-border">
            <h2 className="text-lg font-semibold text-aura-text">
              选择专家场景
            </h2>
            <button
              onClick={onClose}
              className="text-aura-text-muted hover:text-aura-text transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto max-h-[calc(70vh-80px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-aura-border border-t-emerald-400" />
                <span className="ml-3 text-aura-text-muted">加载场景...</span>
              </div>
            ) : scenes.length === 0 ? (
              <div className="text-center py-12 text-aura-text-muted">
                <p className="text-lg mb-2">暂无可用的专家场景</p>
                <p className="text-sm">请检查场景配置或联系管理员</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => {
                      onSelect(scene);
                      onClose();
                    }}
                    className="text-left p-4 rounded-lg border border-aura-border hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0 mt-0.5">
                        {scene.icon ?? "🔧"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-aura-text group-hover:text-emerald-400 transition-colors">
                            {scene.name}
                          </h3>
                          {scene.dbRequired && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex-shrink-0">
                              需要数据库
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-aura-text-muted leading-relaxed line-clamp-2">
                          {scene.description ?? "暂无描述"}
                        </p>
                      </div>
                      <svg
                        className="w-4 h-4 text-aura-text-dim group-hover:text-emerald-400 flex-shrink-0 mt-1 transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
