"use client";

import React, { useState, useCallback } from "react";

interface DraggableSplitterProps {
  onDrag: (deltaX: number) => void;
  axis?: "x" | "y";
}

/**
 * 可拖拽分隔线组件
 * 用于三栏布局中工作空间树 ↔ 预览区、预览区 ↔ 聊天区之间
 */
export function DraggableSplitter({
  onDrag,
  axis = "x",
}: DraggableSplitterProps) {
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const startX = e.clientX;
      const startY = e.clientY;

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = axis === "x" ? ev.clientX - startX : ev.clientY - startY;
        onDrag(delta);
      };

      const handleMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [onDrag, axis]
  );

  return (
    <div
      className={`flex-shrink-0 ${
        axis === "x"
          ? "w-1 cursor-col-resize hover:bg-emerald-500/50"
          : "h-1 cursor-row-resize hover:bg-emerald-500/50"
      } ${dragging ? "bg-emerald-500/70" : "bg-slate-700/30"} transition-colors z-10`}
      onMouseDown={handleMouseDown}
    />
  );
}
