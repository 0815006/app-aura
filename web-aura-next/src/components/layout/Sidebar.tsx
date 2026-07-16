"use client";

import React from "react";
import { useLayout } from "./Layout";
import { useTheme } from "../theme/ThemeProvider";

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { id: "workbench", label: "智能体工作台", icon: "🤖" },
  { id: "knowledge", label: "知识库", icon: "📚" },
  { id: "tools", label: "工具箱", icon: "🧰" },
  { id: "settings", label: "系统设置", icon: "⚙️" },
];

export function Sidebar() {
  const { collapsed } = useLayout();
  const { theme, toggleTheme } = useTheme();
  const [activeId, setActiveId] = React.useState("workbench");

  return (
    <aside
      className="flex flex-col h-full border-r border-aura-border bg-aura-bg"
      style={{
        width: collapsed ? 64 : 240,
        transition: "width 0.2s ease-in-out",
      }}
    >
      {/* 导航菜单 */}
      <nav className="flex-1 pt-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveId(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  activeId === item.id
                    ? "bg-emerald-600/20 text-emerald-400"
                    : "text-aura-text-secondary hover:bg-aura-hover hover:text-aura-text"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                {!collapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* 底部：版本信息 + 主题切换 */}
      {!collapsed && (
        <div className="p-3 border-t border-aura-border flex items-center justify-between">
          <p className="text-xs text-aura-text-dim">Aura v0.1.0</p>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-aura-text-dim hover:text-aura-text hover:bg-aura-hover transition-colors"
            title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          >
            {theme === "dark" ? (
              /* 太阳图标 — 浅色模式 */
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              /* 月亮图标 — 深色模式 */
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
