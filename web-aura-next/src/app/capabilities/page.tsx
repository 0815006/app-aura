import { CapabilitiesSection } from "@/components/agent/CapabilitiesSection";
import { ToolsSection } from "@/components/agent/ToolsSection";

export default function CapabilitiesPage() {
  return (
    <div className="flex flex-col h-full bg-aura-surface text-aura-text overflow-y-auto">
      {/* ==================== 页面头部 ==================== */}
      <header className="flex-shrink-0 border-b border-aura-border bg-aura-bg">
        <div className="flex items-center px-6 py-4">
          {/* 标题 */}
          <div>
            <h1 className="text-base font-bold text-aura-text flex items-center gap-2">
              <span className="text-xl">🧰</span>
              智能体能力中心
            </h1>
            <p className="text-[11px] text-aura-text-dim mt-0.5">
              Aura Agent Capabilities & Tool Registry
            </p>
          </div>
        </div>
      </header>

      {/* ==================== 页面内容 ==================== */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-10">
        {/* 上半部分：智能体能力 */}
        <CapabilitiesSection />

        {/* 分隔线 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-aura-border" />
          <span className="text-xs text-aura-text-dim flex-shrink-0">
            能力驱动工具 · 工具体现能力
          </span>
          <div className="flex-1 h-px bg-aura-border" />
        </div>

        {/* 下半部分：智能体工具 */}
        <ToolsSection />
      </div>
    </div>
  );
}
