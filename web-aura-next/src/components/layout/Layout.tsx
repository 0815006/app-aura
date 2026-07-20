"use client";

import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { isTauri } from "@/lib/tauri";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { ThemeProvider } from "../theme/ThemeProvider";

interface LayoutContextType {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const LayoutContext = createContext<LayoutContextType>({
  collapsed: false,
  toggleCollapsed: () => {},
});

export const useLayout = () => useContext(LayoutContext);

export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // 在 Tauri 桌面客户端中屏蔽浏览器默认右键菜单
  // WorkspaceTree 等组件的自定义右键菜单不受影响（它们通过 React 合成事件 + DOM 渲染实现）
  useEffect(() => {
    if (!isTauri()) return;
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  return (
    <ThemeProvider>
      <LayoutContext.Provider value={{ collapsed, toggleCollapsed }}>
        <div
        className={`layout-wrapper${collapsed ? " collapsed" : ""}`}
        style={{
          display: "grid",
          gridTemplateColumns: collapsed ? "64px 1fr" : "240px 1fr",
          gridTemplateRows: "auto 1fr 34px",
          height: "100dvh",
          width: "100%",
          overflow: "hidden",
          gridTemplateAreas: `
            "sidebar header"
            "sidebar main"
            "status-bar status-bar"
          `,
        }}
      >
        {/* 左侧导航 */}
        <div style={{ gridArea: "sidebar", overflow: "hidden" }}>
          <Sidebar />
        </div>

        {/* 顶部导航栏 */}
        <div style={{ gridArea: "header" }}>
          <Header />
        </div>

        {/* 主视图区域 */}
        <main
          style={{
            gridArea: "main",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </main>

        {/* 底部状态栏 */}
        <div style={{ gridArea: "status-bar" }}>
          <StatusBar />
        </div>
      </div>
      </LayoutContext.Provider>
    </ThemeProvider>
  );
}
