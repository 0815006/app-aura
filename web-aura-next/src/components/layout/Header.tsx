"use client";

import React from "react";
import { useLayout } from "./Layout";

export function Header() {
  const { collapsed, toggleCollapsed } = useLayout();

  return (
    <header
      className="flex items-center justify-between px-4 h-12 border-b border-slate-700 bg-slate-950"
      style={{ minHeight: 48 }}
    >
      {/* 左侧：折叠按钮 + Logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleCollapsed}
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-800"
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <h1 className="text-lg font-bold text-emerald-400 tracking-wide">
            Aura
          </h1>
        </div>
      </div>

      {/* 右侧：用户信息 + 登出 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
            A
          </div>
          <span className="hidden sm:inline">Admin</span>
        </div>

        <button
          className="text-sm text-slate-400 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-slate-800"
          title="登出"
        >
          登出
        </button>
      </div>
    </header>
  );
}
