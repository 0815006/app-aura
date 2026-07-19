"use client";

/**
 * 专家场景展示区（能力页只读展示）
 *
 * 从 /api/scenes 获取场景列表，以卡片网格展示。
 * 纯展示组件，不含交互选择逻辑。
 */
import React, { useState, useEffect, useCallback } from "react";
import type { SceneListItem } from "@/lib/agent/scene-data";

export function ScenesSection() {
  const [scenes, setScenes] = useState<SceneListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadScenes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scenes");
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
    loadScenes();
  }, [loadScenes]);

  return (
    <section className="space-y-4">
      {/* 标题行 + 统计 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-aura-text">
            🎭 专家场景
          </h2>
          <span className="text-[11px] text-aura-text-muted">
            共 {loading ? "—" : scenes.length} 个场景
          </span>
        </div>
        <p className="text-xs text-aura-text-muted">
          通过 System Prompt + 工具组合动态切换 Agent 专家角色。
          选择场景后自动注入角色设定与专属工具，实现一平台多用。
        </p>
      </div>

      {/* 场景卡片网格 */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-aura-border border-t-emerald-400" />
          <span className="ml-2 text-sm text-aura-text-muted">加载场景...</span>
        </div>
      ) : scenes.length === 0 ? (
        <div className="rounded-xl border border-aura-border bg-aura-bg px-6 py-10 text-center">
          <p className="text-sm text-aura-text-muted">暂无可用的专家场景</p>
          <p className="text-xs text-aura-text-dim mt-1">
            场景将在首次访问时自动初始化种子数据
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className={`rounded-xl border bg-aura-bg p-4 transition-colors ${
                scene.status === "planned"
                  ? "border-dashed border-slate-500/30 opacity-75 hover:border-slate-500/40 hover:opacity-90"
                  : "border-aura-border hover:border-emerald-500/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">
                  {scene.icon ?? "🔧"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-aura-text">
                      {scene.name}
                    </h3>
                    {scene.status === "planned" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20 flex-shrink-0">
                        📋 规划中
                      </span>
                    ) : scene.dbRequired ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex-shrink-0">
                        需要 DB
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                        纯文件
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-aura-text-muted leading-relaxed line-clamp-2">
                    {scene.description ?? "暂无描述"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
