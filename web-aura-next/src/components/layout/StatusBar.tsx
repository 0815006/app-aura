"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ServerUrlDialog } from "./ServerUrlDialog";
import { getServerUrl, getAuraMode } from "@/lib/server-url";

const POLL_INTERVAL = 30_000; // 30 秒轮询一次

/**
 * 获取健康检查的完整 URL
 */
function getHealthUrl(): string {
  const base = getServerUrl();
  return base ? `${base}/api/health` : "/api/health";
}

export function StatusBar() {
  const [time, setTime] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const auraMode = getAuraMode();

  const checkHealth = useCallback(async () => {
    try {
      const url = getHealthUrl();
      const res = await fetch(url, { cache: "no-store" });
      setConnected(res.ok);
    } catch {
      setConnected(false);
    }
  }, []);

  const handleUrlChanged = useCallback(() => {
    // 地址变更后立即重新检测
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    const updateTime = () => {
      setTime(
        new Date().toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const isClient = auraMode === "client";

  return (
    <footer className="flex items-center justify-between px-4 bg-aura-bg border-t border-aura-border-light text-xs text-aura-text-muted select-none">
      <div
        className={`flex items-center gap-2 ${
          isClient
            ? "cursor-pointer hover:text-aura-text transition-colors"
            : ""
        }`}
        onClick={() => {
          if (isClient) setDialogOpen(true);
        }}
        title={isClient ? "点击设置服务端地址" : undefined}
        role={isClient ? "button" : undefined}
        tabIndex={isClient ? 0 : undefined}
        onKeyDown={(e) => {
          if (isClient && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setDialogOpen(true);
          }
        }}
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected === null
              ? "bg-yellow-500"
              : connected
                ? "bg-emerald-500"
                : "bg-red-500"
          }`}
        />
        <span>
          {connected === null
            ? "检测中..."
            : connected
              ? "已连接"
              : "未连接"}
        </span>
      </div>
      <div>{time}</div>

      {/* 服务端地址编辑弹窗（仅客户端模式） */}
      {isClient && (
        <ServerUrlDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onUrlChanged={handleUrlChanged}
        />
      )}
    </footer>
  );
}
