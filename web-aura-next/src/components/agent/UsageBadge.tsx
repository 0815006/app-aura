"use client";

/**
 * UsageBadge —— Token 用量展示组件
 *
 * 在聊天区 Header 显示当前会话的累计 Token 消耗。
 * 支持实时更新（收到 onFinish 事件时刷新）。
 */
interface UsageBadgeProps {
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  modelName?: string;
}

/** 格式化 Token 数量（K/M 缩写） */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 估算费用（DeepSeek 默认价格，仅作参考） */
function estimateCost(totalTokens: number, modelName?: string): string {
  // DeepSeek-V3 默认: ¥1/M input, ¥2/M output
  // 简化为平均 ¥1.5/M tokens
  const pricePerM = modelName?.includes("r1") ? 4 : 1.5;
  const cost = (totalTokens / 1_000_000) * pricePerM;
  if (cost < 0.01) return "< ¥0.01";
  return `¥${cost.toFixed(2)}`;
}

export function UsageBadge({
  totalTokens,
  promptTokens,
  completionTokens,
  modelName,
}: UsageBadgeProps) {
  if (totalTokens <= 0) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] text-aura-text-muted bg-aura-surface border border-aura-border rounded-full px-2.5 py-0.5"
      title={
        promptTokens != null
          ? `Prompt: ${formatTokens(promptTokens)} · Completion: ${formatTokens(completionTokens ?? 0)}`
          : undefined
      }
    >
      <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full" />
      {formatTokens(totalTokens)} tokens
      <span className="opacity-50">·</span>
      {estimateCost(totalTokens, modelName)}
    </span>
  );
}
