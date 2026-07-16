"use client";

import React from "react";
import type { ToolMeta } from "@/lib/agent/tool-registry";

interface ToolRowProps {
  tool: ToolMeta;
}

export function ToolRow({ tool }: ToolRowProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border-b border-aura-border last:border-b-0">
      {/* 工具行主体 */}
      <button
        onClick={() =>
          setExpanded(
            tool.parameters && tool.parameters.length > 0 ? !expanded : false
          )
        }
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-aura-hover/50 transition-colors"
      >
        {/* 注册状态指示点 */}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            tool.registered
              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
              : "bg-slate-600"
          }`}
          title={tool.registered ? "已注册" : "未注册"}
        />

        {/* 工具图标 */}
        <span className="text-base flex-shrink-0">{tool.categoryIcon}</span>

        {/* 工具信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono font-semibold text-emerald-400">
              {tool.name}
            </code>
            <span className="text-xs text-aura-text-secondary">
              {tool.displayName}
            </span>
          </div>
          <p className="text-[11px] text-aura-text-muted mt-0.5 leading-relaxed line-clamp-2">
            {tool.description}
          </p>
        </div>

        {/* 展开箭头 */}
        {tool.parameters && tool.parameters.length > 0 && (
          <svg
            className={`w-4 h-4 text-aura-text-dim flex-shrink-0 transition-transform duration-200 ${
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
        )}
      </button>

      {/* 展开参数列表 */}
      {expanded && tool.parameters && tool.parameters.length > 0 && (
        <div className="px-4 pb-3 pl-14">
          <div className="bg-aura-surface rounded-lg border border-aura-border overflow-hidden">
            <div className="px-3 py-1.5 border-b border-aura-border">
              <span className="text-[10px] font-semibold text-aura-text-dim uppercase tracking-wider">
                参数列表
              </span>
            </div>
            <div className="divide-y divide-aura-border">
              {tool.parameters.map((param) => (
                <div
                  key={param.name}
                  className="px-3 py-2 flex items-start gap-3"
                >
                  <code className="text-[11px] font-mono text-aura-text flex-shrink-0">
                    {param.name}
                    {param.required ? (
                      <span className="text-red-400 ml-0.5">*</span>
                    ) : (
                      <span className="text-aura-text-dim ml-0.5">?</span>
                    )}
                  </code>
                  <span className="text-[10px] text-aura-text-dim bg-aura-hover px-1 py-0.5 rounded font-mono flex-shrink-0">
                    {param.type}
                  </span>
                  <span className="text-[11px] text-aura-text-secondary leading-relaxed">
                    {param.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
