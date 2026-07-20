"use client";

import React, { useCallback, useEffect, useState } from "react";

const HEALTH_URL = "/api/health";
const POLL_INTERVAL = 30_000; // 30 秒轮询一次

export function StatusBar() {
  const [time, setTime] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(HEALTH_URL, { cache: "no-store" });
      setConnected(res.ok);
    } catch {
      setConnected(false);
    }
  }, []);

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

  return (
    <footer className="flex items-center justify-between px-4 bg-aura-bg border-t border-aura-border-light text-xs text-aura-text-muted select-none">
      <div className="flex items-center gap-2">
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
    </footer>
  );
}
