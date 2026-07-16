"use client";

import React from "react";
import {
  AGENT_TOOLS,
  TOOL_CATEGORIES,
  getToolStats,
  type ToolCategory,
} from "@/lib/agent/tool-registry";
import { ToolRow } from "./ToolRow";

export function ToolsSection() {
  const [activeCategory, setActiveCategory] = React.useState<
    ToolCategory | "all"
  >("all");
  const stats = getToolStats();

  const filteredTools =
    activeCategory === "all"
      ? AGENT_TOOLS
      : AGENT_TOOLS.filter((t) => t.category === activeCategory);

  const categoryOptions: { key: ToolCategory | "all"; label: string; icon: string }[] =
    [
      { key: "all", label: "全部", icon: "🛠️" },
      ...(Object.entries(TOOL_CATEGORIES) as [ToolCategory, { label: string; icon: string }][]).map(
        ([key, val]) => ({
          key,
          label: val.label,
          icon: val.icon,
        })
      ),
    ];

  return (
    <section className="space-y-4">
      {/* 标题行 + 统计 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-aura-text">
            🔧 智能体工具集
          </h2>
          <span className="text-[11px] text-aura-text-muted">
            共 {stats.total} 个工具 · {stats.registered} 个已注册
          </span>
        </div>
        <p className="text-xs text-aura-text-muted">
          Agent 通过调用以下工具与工作空间交互，后续将逐步扩展专业领域工具（DBA、性能诊断等）
        </p>
      </div>

      {/* 分类筛选栏 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {categoryOptions.map((opt) => {
          const isActive = activeCategory === opt.key;
          const count =
            opt.key === "all"
              ? AGENT_TOOLS.length
              : AGENT_TOOLS.filter((t) => t.category === opt.key).length;

          return (
            <button
              key={opt.key}
              onClick={() => setActiveCategory(opt.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                isActive
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                  : "text-aura-text-secondary hover:bg-aura-hover border border-transparent"
              }`}
            >
              <span className="text-sm">{opt.icon}</span>
              <span>{opt.label}</span>
              <span
                className={`ml-0.5 text-[10px] ${
                  isActive ? "text-emerald-400" : "text-aura-text-dim"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 工具列表 */}
      <div className="rounded-xl border border-aura-border bg-aura-bg overflow-hidden">
        {filteredTools.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-aura-text-muted">该分类下暂无工具</p>
          </div>
        ) : (
          filteredTools.map((tool) => (
            <ToolRow key={tool.name} tool={tool} />
          ))
        )}
      </div>

      {/* 统计摘要 */}
      <div className="flex items-center gap-4 text-[11px] text-aura-text-dim">
        {(Object.entries(TOOL_CATEGORIES) as [ToolCategory, { label: string; icon: string }][]).map(
          ([key, val]) => {
            const count = AGENT_TOOLS.filter((t) => t.category === key).length;
            return (
              <span key={key} className="flex items-center gap-1">
                <span>{val.icon}</span>
                {val.label} × {count}
              </span>
            );
          }
        )}
      </div>
    </section>
  );
}
