"use client";

/**
 * StepTimeline —— 智能体步骤时间线
 *
 * 在 AI 聊天消息中以时间线形式展示 Agent 执行的每个步骤：
 * - 💭 思考 (thought) — 模型输出的分析/规划文本
 * - 🔧 工具调用 (tool-call) — 调用的工具名和参数
 * - ✓ 工具结果 (tool-result) — 工具执行的返回值
 *
 * 支持实时流式更新（running 状态 + 计时器）和静态历史展示。
 */
import { useState, useEffect } from "react";

// ============================================================
// 类型
// ============================================================

export interface TimelineStep {
  index: number;
  type: "thought" | "tool-call" | "tool-result";
  /** 思考文本 */
  text?: string;
  /** 工具名 */
  toolName?: string;
  /** 工具参数 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolArgs?: Record<string, any>;
  /** 工具结果 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolResult?: any;
  /** 状态: running | done */
  state?: "call" | "partial-call" | "result" | "done";
  /** 步骤耗时 (ms) */
  durationMs?: number;
  /** 步骤级 Token 用量 (从 onStepFinish 或 DB 获取) */
  stepTokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface StepTimelineProps {
  steps: TimelineStep[];
  /** 是否处于实时流式模式（显示计时器） */
  isStreaming?: boolean;
}

// ============================================================
// 辅助
// ============================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ============================================================
// 单项
// ============================================================

function TimelineItem({
  step,
  isLast,
  isStreaming,
}: {
  step: TimelineStep;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const isRunning =
    step.state === "call" || step.state === "partial-call";

  const [expanded, setExpanded] = useState(
    // ★ 流式时自动展开所有步骤，让用户看到完整执行过程
    isStreaming || isRunning
  );
  const [elapsed, setElapsed] = useState(0);

  // ★ 运行中的步骤：实时计时器
  useEffect(() => {
    if (!isRunning || !isStreaming) return;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 100);
    return () => clearInterval(timer);
  }, [isRunning, isStreaming]);

  const displayDuration = isRunning ? elapsed : step.durationMs;

  // 步骤图标与颜色
  let icon: string;
  let badgeClass: string;
  let lineClass: string;
  let dotClass: string;

  if (step.type === "thought") {
    icon = "💭";
    badgeClass = "bg-amber-500/15 text-amber-400 border-amber-500/30";
    lineClass = "border-amber-500/30";
    dotClass = "bg-amber-500";
  } else if (step.type === "tool-call") {
    icon = "🔧";
    badgeClass = "bg-blue-500/15 text-blue-400 border-blue-500/30";
    lineClass = "border-blue-500/30";
    dotClass = "bg-blue-500";
  } else {
    icon = "✓";
    badgeClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    lineClass = "border-emerald-500/30";
    dotClass = "bg-emerald-500";
  }

  const label =
    step.type === "thought"
      ? "思考"
      : step.type === "tool-call"
        ? `调用 ${step.toolName ?? "unknown"}`
        : `结果${step.toolName ? ` (${step.toolName})` : ""}`;

  // 结果解析
  let isError = false;
  let resultPreview = "";
  if (step.type === "tool-result" && step.toolResult != null) {
    if (typeof step.toolResult === "string") {
      try {
        const parsed = JSON.parse(step.toolResult) as Record<string, unknown>;
        isError = !!(parsed.error || parsed.status === "error");
        resultPreview = isError
          ? String(parsed.error ?? "未知错误")
          : String(parsed.message ?? step.toolResult);
      } catch {
        resultPreview = step.toolResult.slice(0, 200);
      }
    } else if (typeof step.toolResult === "object") {
      const obj = step.toolResult as Record<string, unknown>;
      isError = !!(obj.error || obj.status === "error");
      resultPreview = isError
        ? String(obj.error ?? "未知错误")
        : JSON.stringify(step.toolResult).slice(0, 200);
    }
  }

  return (
    <div className="relative pl-8">
      {/* 垂直连线 */}
      {!isLast && (
        <div
          className={`absolute left-[11px] top-6 bottom-0 w-px ${lineClass}`}
        />
      )}

      {/* 节点圆点 */}
      <div
        className={`absolute left-[5px] top-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
          isRunning
            ? "border-blue-500 bg-blue-500/20 animate-pulse"
            : `${dotClass} bg-opacity-30 border-current`
        }`}
      >
        {isRunning && (
          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
        )}
      </div>

      {/* 步骤卡片 */}
      <div
        className={`rounded-lg border text-xs transition-all ${
          isRunning
            ? "border-blue-500/40 bg-blue-500/5"
            : "border-aura-border bg-aura-bg"
        }`}
      >
        {/* 头部：步骤类型 + 耗时 + Token */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-aura-hover/50 transition-colors rounded-t-lg"
        >
          {/* 类型标签 */}
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${badgeClass}`}
          >
            {icon} {label}
          </span>

          {/* 耗时 */}
          {displayDuration != null && (
            <span className="text-[10px] text-aura-text-muted flex-shrink-0 tabular-nums">
              ⏱ {formatDuration(displayDuration)}
            </span>
          )}

          {/* Token 用量 */}
          {step.stepTokens && step.stepTokens.totalTokens > 0 && (
            <span className="text-[10px] text-aura-text-muted flex-shrink-0">
              🪙 {formatTokens(step.stepTokens.totalTokens)} tokens
            </span>
          )}

          {/* 运行中动画 */}
          {isRunning && (
            <span className="text-[10px] text-blue-400 animate-pulse ml-auto">
              执行中...
            </span>
          )}

          {/* 错误标记 */}
          {isError && (
            <span className="text-[10px] text-red-400 ml-auto">✗ 失败</span>
          )}
        </button>

        {/* 展开内容 */}
        {expanded && (
          <div className="px-3 pb-2.5 pt-1 border-t border-aura-border space-y-1.5">
            {/* 思考文本 */}
            {step.type === "thought" && (
              step.text && step.text.trim().length > 0 ? (
                <p className="text-aura-text-secondary leading-relaxed italic whitespace-pre-wrap">
                  {step.text}
                </p>
              ) : isStreaming ? (
                <p className="text-aura-text-muted italic animate-pulse">
                  思考中...
                </p>
              ) : null
            )}

            {/* 工具参数 */}
            {step.type === "tool-call" && step.toolArgs && (
              <div>
                <span className="text-[10px] text-aura-text-muted font-semibold">
                  📥 参数
                </span>
                <pre className="mt-0.5 text-[11px] text-aura-text overflow-x-auto max-h-24 bg-aura-surface rounded p-1.5 leading-relaxed">
                  {JSON.stringify(step.toolArgs, null, 2)}
                </pre>
              </div>
            )}

            {/* 工具结果 */}
            {step.type === "tool-result" && resultPreview && (
              <div>
                <span
                  className={`text-[10px] font-semibold ${
                    isError ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {isError ? "✗ 错误" : "✓ 结果"}
                </span>
                <pre
                  className={`mt-0.5 text-[11px] overflow-x-auto max-h-32 bg-aura-surface rounded p-1.5 leading-relaxed ${
                    isError ? "text-red-300" : "text-emerald-300"
                  }`}
                >
                  {resultPreview}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export function StepTimeline({ steps, isStreaming = false }: StepTimelineProps) {
  if (!steps || steps.length === 0) return null;

  // 去重合并：同一个 tool 的 call + result 合并为一个 step
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged: TimelineStep[] = [];
  const seenTools = new Map<string, number>(); // toolName -> mergedIndex

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === "tool-call" && s.toolName) {
      // 检查下一个是否是对应的 result
      const next = steps[i + 1];
      if (next && next.type === "tool-result" && next.toolName === s.toolName) {
        // 合并 call + result
        merged.push({
          ...s,
          type: "tool-call",
          toolResult: next.toolResult,
          state: next.state ?? s.state,
        });
        i++; // 跳过 result
        continue;
      }
    }
    if (s.type === "tool-result") {
      // 孤立的 result（前面没有对应 call），保留
    }
    merged.push(s);
  }

  return (
    <div className="mt-2 space-y-1">
      {merged.map((step, i) => (
        <TimelineItem
          key={`${step.index}-${step.type}-${step.toolName ?? ""}`}
          step={step}
          isLast={i === merged.length - 1 && !isStreaming}
          isStreaming={isStreaming}
        />
      ))}
    </div>
  );
}
