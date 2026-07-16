"use client";

import React from "react";
import type { CapabilityItem } from "@/lib/agent/capabilities-data";

interface CapabilityCardProps {
  item: CapabilityItem;
  colorClass: {
    badge: string;
    border: string;
    glow: string;
  };
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  done: {
    label: "✅ 已实现",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  wip: {
    label: "🚧 开发中",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  planned: {
    label: "📋 规划中",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  },
};

export function CapabilityCard({ item, colorClass }: CapabilityCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const status = STATUS_LABELS[item.status];

  return (
    <div
      className={`rounded-xl border bg-aura-bg transition-all duration-200 ${
        expanded
          ? `${colorClass.border} ${colorClass.glow}`
          : "border-aura-border hover:border-aura-border-light"
      }`}
    >
      {/* 卡片头部（可点击） */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        {/* 图标 */}
        <span className="text-2xl flex-shrink-0 mt-0.5">{item.icon}</span>

        {/* 中间内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-aura-text">
              {item.name}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="text-xs text-aura-text-secondary mt-1 leading-relaxed">
            {item.description}
          </p>
        </div>

        {/* 展开箭头 */}
        <svg
          className={`w-4 h-4 text-aura-text-muted flex-shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
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

      {/* 展开详情 */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-aura-border pt-3 space-y-3">
          <p className="text-xs text-aura-text-secondary leading-relaxed">
            {item.details}
          </p>

          {item.sdkFeature && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-aura-text-dim">SDK 能力：</span>
              <code className="text-[10px] px-2 py-0.5 rounded bg-aura-hover text-emerald-400 font-mono">
                {item.sdkFeature}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
