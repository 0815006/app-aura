"use client";

/**
 * RunDetailPanel —— Run 详情面板
 *
 * 在预览区展示单次 Agent Run 的完整详情：
 * - 摘要卡片（token 用量、模型、状态）
 * - 步骤时间线（thought → tool-call → tool-result）
 * - 记忆变更（如有）
 *
 * 通过 fetch /api/workspaces/runs/[runId] 获取数据。
 */
import { useState, useEffect } from "react";
import { auraFetch } from "@/lib/api-client";

// ============================================================
// 类型定义
// ============================================================

interface RunStep {
  stepNumber: number;
  stepType: "thought" | "tool-call" | "tool-result";
  thought?: string | null;
  toolName?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolArgs?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolResult?: any;
  durationMs?: number | null;
  createTime: string;
}

interface RunInfo {
  id: string;
  sessionId: string;
  userPrompt: string;
  finalResponse: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string | null;
  modelName: string | null;
  status: string;
  createTime: string;
}

interface RunDetailData {
  run: RunInfo;
  steps: RunStep[];
}

interface RunDetailPanelProps {
  runId: string | null;
}

// ============================================================
// 辅助函数
// ============================================================

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

// ============================================================
// 组件
// ============================================================

export function RunDetailPanel({ runId }: RunDetailPanelProps) {
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    auraFetch(`/api/workspaces/runs/${runId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.code === 200 && json.data) {
          setData(json.data as RunDetailData);
        } else {
          setError(json.message ?? "加载失败");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "网络错误");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  // ============================================================
  // 空状态 / 加载 / 错误
  // ============================================================

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm text-aura-text-muted">选择一次运行记录查看详情</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-aura-text-muted animate-pulse">
          加载中...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { run, steps } = data;

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* ========== 摘要卡片 ========== */}
      <div className="bg-aura-surface border border-aura-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-aura-text">📊 Run 详情</h3>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              run.status === "completed"
                ? "bg-emerald-500/20 text-emerald-400"
                : run.status === "error"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {run.status}
          </span>
        </div>

        {/* Token 统计 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-aura-bg rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-aura-text-muted mb-0.5">Prompt</p>
            <p className="text-sm font-mono font-bold text-aura-text">
              {formatTokens(run.promptTokens)}
            </p>
          </div>
          <div className="bg-aura-bg rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-aura-text-muted mb-0.5">
              Completion
            </p>
            <p className="text-sm font-mono font-bold text-aura-text">
              {formatTokens(run.completionTokens)}
            </p>
          </div>
          <div className="bg-aura-bg rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-aura-text-muted mb-0.5">Total</p>
            <p className="text-sm font-mono font-bold text-emerald-400">
              {formatTokens(run.totalTokens)}
            </p>
          </div>
        </div>

        {/* 元信息 */}
        <div className="text-[10px] text-aura-text-muted space-y-1">
          <p>模型: {run.modelName ?? "—"}</p>
          <p>结束原因: {run.finishReason ?? "—"}</p>
          <p>时间: {formatTime(run.createTime)}</p>
        </div>

        {/* 用户提示 */}
        <div className="bg-aura-bg rounded-lg p-3">
          <p className="text-[10px] text-aura-text-muted mb-1 font-semibold">
            💬 用户输入
          </p>
          <p className="text-xs text-aura-text leading-relaxed whitespace-pre-wrap">
            {run.userPrompt}
          </p>
        </div>
      </div>

      {/* ========== 步骤时间线 ========== */}
      {steps.length > 0 && (() => {
        const totalDuration = steps.reduce(
          (sum, s) => sum + (s.durationMs ?? 0),
          0
        );

        return (
          <div className="bg-aura-surface border border-aura-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-aura-text">
                📝 步骤时间线 ({steps.length} 步)
              </h3>
              {totalDuration > 0 && (
                <span className="text-[10px] text-aura-text-muted">
                  总耗时: {(totalDuration / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            <div className="relative">
              {/* 垂直连线 */}
              <div className="absolute left-[15px] top-0 bottom-0 w-px bg-aura-border" />

              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="relative pl-10">
                    {/* 节点圆点 */}
                    <div
                      className={`absolute left-[10px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                        step.stepType === "thought"
                          ? "bg-amber-500/30 border-amber-500"
                          : step.stepType === "tool-call"
                            ? "bg-blue-500/30 border-blue-500"
                            : "bg-emerald-500/30 border-emerald-500"
                      }`}
                    />

                    {/* 步骤内容 */}
                    <div className="bg-aura-bg rounded-lg p-3">
                      {/* 头部：类型 + 耗时 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-semibold uppercase ${
                            step.stepType === "thought"
                              ? "text-amber-400"
                              : step.stepType === "tool-call"
                                ? "text-blue-400"
                                : "text-emerald-400"
                          }`}
                        >
                          {step.stepType === "thought"
                            ? "💭 思考"
                            : step.stepType === "tool-call"
                              ? `🔧 ${step.toolName ?? "工具调用"}`
                              : `✓ 结果${step.toolName ? ` (${step.toolName})` : ""}`}
                        </span>

                        {/* ★ 耗时 */}
                        {step.durationMs != null && step.durationMs > 0 && (
                          <span className="text-[10px] text-aura-text-muted">
                            ⏱{" "}
                            {step.durationMs < 1000
                              ? `${step.durationMs}ms`
                              : `${(step.durationMs / 1000).toFixed(1)}s`}
                          </span>
                        )}

                        {/* ★ 步骤序号 */}
                        <span className="text-[10px] text-aura-text-dim ml-auto">
                          Step {step.stepNumber}
                        </span>
                      </div>

                      {/* 内容 */}
                      {step.stepType === "thought" && step.thought && (
                        <p className="text-xs text-aura-text-muted mt-1.5 leading-relaxed whitespace-pre-wrap italic">
                          {step.thought.length > 500
                            ? step.thought.slice(0, 500) + "..."
                            : step.thought}
                        </p>
                      )}

                      {step.stepType === "tool-call" && step.toolArgs && (
                        <pre className="text-[11px] text-aura-text-secondary mt-1.5 overflow-x-auto max-h-24 bg-aura-surface rounded p-1.5">
                          {JSON.stringify(step.toolArgs, null, 2)}
                        </pre>
                      )}

                      {step.stepType === "tool-result" && step.toolResult && (
                        <pre className="text-[11px] text-emerald-300 mt-1.5 overflow-x-auto max-h-32 bg-aura-surface rounded p-1.5">
                          {typeof step.toolResult === "string"
                            ? step.toolResult
                            : JSON.stringify(step.toolResult, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
