"use client";

import React, { useEffect, useState } from "react";

export function StatusBar() {
  const [time, setTime] = useState("");
  const [connected, setConnected] = useState(true);

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

  return (
    <footer className="flex items-center justify-between px-4 bg-aura-bg border-t border-aura-border-light text-xs text-aura-text-muted select-none">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
        <span>{connected ? "已连接" : "未连接"}</span>
      </div>
      <div>{time}</div>
    </footer>
  );
}
