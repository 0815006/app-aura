"use client";

import React from "react";
import { useLayout } from "./Layout";

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
  const [activeId, setActiveId] = React.useState("workbench");

  return (
    <aside
      className="flex flex-col h-full border-r border-slate-700 bg-slate-950"
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
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
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

      {/* 底部版本信息 */}
      {!collapsed && (
        <div className="p-3 border-t border-slate-800">
          <p className="text-xs text-slate-600">Aura v0.1.0</p>
        </div>
      )}
    </aside>
  );
}
