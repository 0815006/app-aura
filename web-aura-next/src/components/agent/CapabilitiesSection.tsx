"use client";

import React from "react";
import {
  CAPABILITY_LAYERS,
  getCapabilitiesByLayer,
  getCapabilityStats,
} from "@/lib/agent/capabilities-data";
import { CapabilityCard } from "./CapabilityCard";

const LAYER_COLORS: Record<
  number,
  { badge: string; border: string; glow: string; text: string; dot: string }
> = {
  1: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    border: "border-blue-500/40",
    glow: "shadow-[0_0_12px_rgba(59,130,246,0.12)]",
    text: "text-blue-400",
    dot: "bg-blue-500",
  },
  2: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    border: "border-emerald-500/40",
    glow: "shadow-[0_0_12px_rgba(16,185,129,0.12)]",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
  },
  3: {
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    border: "border-amber-500/40",
    glow: "shadow-[0_0_12px_rgba(245,158,11,0.12)]",
    text: "text-amber-400",
    dot: "bg-amber-500",
  },
  4: {
    badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    border: "border-purple-500/40",
    glow: "shadow-[0_0_12px_rgba(168,85,247,0.12)]",
    text: "text-purple-400",
    dot: "bg-purple-500",
  },
};

export function CapabilitiesSection() {
  const layers = CAPABILITY_LAYERS;
  const byLayer = getCapabilitiesByLayer();
  const stats = getCapabilityStats();

  return (
    <section className="space-y-8">
      {/* 标题行 + 统计 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-aura-text">
            🤖 智能体能力
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-aura-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              已实现 {stats.done}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              开发中 {stats.wip}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              规划中 {stats.planned}
            </span>
          </div>
        </div>
        <p className="text-xs text-aura-text-muted">
          基于 Vercel AI SDK 构建的四层能力体系，共计 {stats.total} 项能力
        </p>
      </div>

      {/* 按层次展示 */}
      {layers.map((layer) => {
        const items = byLayer.get(layer.level) ?? [];
        if (items.length === 0) return null;

        const colors = LAYER_COLORS[layer.level];

        return (
          <div key={layer.level}>
            {/* 层次标题 */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`}
              />
              <h3 className={`text-sm font-bold ${colors.text}`}>
                L{layer.level} — {layer.name}
              </h3>
              <span className="text-[11px] text-aura-text-dim">
                · {layer.subtitle}
              </span>
            </div>

            {/* 卡片网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((item) => (
                <CapabilityCard
                  key={item.id}
                  item={item}
                  colorClass={{
                    badge: colors.badge,
                    border: colors.border,
                    glow: colors.glow,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
