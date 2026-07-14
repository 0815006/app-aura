"use client";

import React, { createContext, useContext, useState, type ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

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

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  return (
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
  );
}
