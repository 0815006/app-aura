"use client";

/**
 * StepAccordion —— 步骤折叠器
 *
 * 在 AI 聊天消息中渲染步骤折叠卡片，展示：
 * - 💭 思考过程 (reasoning)
 * - 🔧 工具调用 (tool-invocation)
 * - ✓ 工具执行结果
 *
 * 每个步骤可独立折叠/展开，默认工具调用展开、思考过程折叠。
 */
import { useState } from "react";

export interface StepInfo {
  index: number;
  type: "reasoning" | "tool-invocation";
  text?: string;
  toolName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolArgs?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolResult?: any;
  state?: string; // 'call' | 'result' | 'partial-call'
}

interface StepAccordionProps {
  steps: StepInfo[];
}

function StepAccordionItem({ step }: { step: StepInfo }) {
  const [expanded, setExpanded] = useState(
    step.type === "tool-invocation" && step.state !== "call"
  );

  if (step.type === "reasoning") {
    return (
      <details className="mt-1.5 text-xs text-amber-400/70 group">
        <summary className="cursor-pointer hover:text-amber-300 transition-colors select-none">
          <span className="inline-flex items-center gap-1.5">
            <svg
              className="w-3 h-3 transition-transform group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            💭 思考过程
          </span>
        </summary>
        <p className="mt-1.5 pl-5 italic text-aura-text-muted leading-relaxed whitespace-pre-wrap">
          {step.text}
        </p>
      </details>
    );
  }

  // tool-invocation
  const isRunning =
    step.state === "call" || step.state === "partial-call";
  const hasResult = step.toolResult != null;

  // ★ 正确检测工具执行错误：工具返回 JSON 字符串，需要解析后判断
  let isError = false;
  let parsedResult: Record<string, unknown> | null = null;
  if (hasResult) {
    if (typeof step.toolResult === "object" && step.toolResult !== null) {
      // 对象类型结果（某些 SDK 版本）
      const obj = step.toolResult as Record<string, unknown>;
      isError = !!(obj.error || obj.status === "error");
      parsedResult = obj;
    } else if (typeof step.toolResult === "string") {
      // 字符串类型结果：尝试解析 JSON（工具通常返回 JSON 字符串）
      try {
        const obj = JSON.parse(step.toolResult) as Record<string, unknown>;
        isError = !!(obj.error || obj.status === "error");
        parsedResult = obj;
      } catch {
        // 非 JSON 字符串，视为正常文本结果
        parsedResult = null;
      }
    }
  }

  return (
    <div className="mt-2 text-xs border border-aura-border rounded-lg overflow-hidden bg-aura-surface">
      {/* 头部：工具名 + 状态 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-aura-hover transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* 状态图标 */}
          {isRunning ? (
            <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse flex-shrink-0" />
          ) : isError ? (
            <span className="text-red-400 flex-shrink-0">✗</span>
          ) : (
            <span className="text-emerald-400 flex-shrink-0">✓</span>
          )}
          <span className="text-amber-400 font-mono truncate">
            🔧 {step.toolName ?? "unknown"}
          </span>
        </div>
        <svg
          className={`w-3 h-3 text-aura-text-muted transition-transform flex-shrink-0 ml-2 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-aura-border pt-2">
          {/* 参数 */}
          {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
            <div>
              <span className="text-aura-text-muted font-semibold block mb-0.5">
                📥 参数:
              </span>
              <pre className="text-aura-text-secondary overflow-x-auto max-h-32 bg-aura-bg rounded p-1.5 text-[11px] leading-relaxed">
                {JSON.stringify(step.toolArgs, null, 2)}
              </pre>
            </div>
          )}

          {/* 结果 */}
          {hasResult && (
            <div>
              <span
                className={`font-semibold block mb-0.5 ${
                  isError ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {isError ? "✗ 错误:" : "✓ 结果:"}
              </span>
              <pre
                className={`overflow-x-auto max-h-40 bg-aura-bg rounded p-1.5 text-[11px] leading-relaxed ${
                  isError ? "text-red-300" : "text-emerald-300"
                }`}
              >
                {parsedResult
                  ? JSON.stringify(parsedResult, null, 2)
                  : typeof step.toolResult === "string"
                    ? step.toolResult
                    : JSON.stringify(step.toolResult, null, 2)}
              </pre>
            </div>
          )}

          {/* 执行中占位 */}
          {isRunning && !hasResult && (
            <div className="flex items-center gap-2 py-1">
              <span className="text-aura-text-muted animate-pulse">
                执行中...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StepAccordion({ steps }: StepAccordionProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="space-y-0.5 mt-1">
      {steps.map((step) => (
        <StepAccordionItem key={`${step.index}-${step.type}-${step.toolName ?? ""}`} step={step} />
      ))}
    </div>
  );
}
