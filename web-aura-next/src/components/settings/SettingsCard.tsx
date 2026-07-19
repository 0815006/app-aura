"use client";

/**
 * 系统设置页通用卡片组件
 */
import React from "react";

interface SettingsCardProps {
  icon: string;
  title: string;
  description: string;
  badge?: { text: string; color: "amber" | "emerald" | "red" };
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const BADGE_COLORS: Record<string, string> = {
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  red: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function SettingsCard({ icon, title, description, badge, children, footer }: SettingsCardProps) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-bg overflow-hidden">
      {/* 头部 */}
      <div className="px-5 py-4 border-b border-aura-border">
        <div className="flex items-center gap-3">
          <span className="text-xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-aura-text">{title}</h3>
              {badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${BADGE_COLORS[badge.color]}`}
                >
                  {badge.text}
                </span>
              )}
            </div>
            <p className="text-[11px] text-aura-text-muted mt-0.5 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </div>

      {/* 内容 */}
      <div className="px-5 py-4">{children}</div>

      {/* 底部 */}
      {footer && (
        <div className="px-5 py-3 border-t border-aura-border bg-aura-surface/50">
          {footer}
        </div>
      )}
    </div>
  );
}
