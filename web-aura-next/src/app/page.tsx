"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useCallback, useRef, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceTree } from "@/components/agent/WorkspaceTree";
import { DraggableSplitter } from "@/components/agent/DraggableSplitter";
import { ModelSwitcher, type ModelConfigSafe } from "@/components/agent/ModelSwitcher";
import { ModelConfigPanel } from "@/components/agent/ModelConfigPanel";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Aura 智能体工作台主页
 *
 * 三栏布局（PRD 5.1）：
 * - 左侧：工作空间树（可折叠）
 * - 中间：文件预览区（默认与右侧等宽，可通过分隔线拖拽）
 * - 右侧：AI 聊天区
 *
 * ★ Phase 5: 路由保护 — 未登录且非客户端模式时重定向到 /login
 * ★ Phase 6: 模型选择器 + 配置面板集成
 */
const MIN_PANEL_WIDTH = 200;

export default function AgentWorkbench() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // ============================================================
  // ★ Phase 5: 路由保护
  // ============================================================
  const isClientMode =
    typeof window !== "undefined" &&
    !!(window as unknown as Record<string, unknown>).__AURA_MODE__;

  useEffect(() => {
    if (!authLoading && !user && !isClientMode) {
      router.push("/login");
    }
  }, [authLoading, user, isClientMode, router]);

  // ============================================================
  // 状态
  // ============================================================

  // 工作空间
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);

  // 左侧栏宽度（初始 240px）
  const [leftWidth, setLeftWidth] = useState(240);
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // 中间预览区宽度（初始通过 flex 1:1，用比例代替绝对值）
  const [rightRatio, setRightRatio] = useState(0.5); // 右侧占剩余宽度的 50%
  const containerRef = useRef<HTMLDivElement>(null);

  // 刷新标记（文件变更后通知树组件重新加载）
  const [refreshToken, setRefreshToken] = useState(0);

  // ★ Phase 6: 模型配置
  const [selectedModelConfig, setSelectedModelConfig] =
    useState<ModelConfigSafe | null>(null);
  const [modelConfigPanelOpen, setModelConfigPanelOpen] = useState(false);
  const [modelSwitchKey, setModelSwitchKey] = useState(0); // 用于刷新 ModelSwitcher

  // 聊天
  const [chatInput, setChatInput] = useState("");

  // ★ ref 追踪最新 workspaceId / modelConfig，使 transport body 函数能读到当前值
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const modelConfigRef = useRef(selectedModelConfig);
  modelConfigRef.current = selectedModelConfig;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // ★ body 为函数，每次发请求时动态求值，解决 useState 闭包过期问题
      body: () => {
        const extra: Record<string, unknown> = {};
        if (workspaceIdRef.current) {
          extra.workspaceId = workspaceIdRef.current;
        }
        if (modelConfigRef.current) {
          extra.modelConfigId = modelConfigRef.current.id;
        }
        return extra;
      },
    }),
  } as any);

  const isLoading = status === "submitted" || status === "streaming";

  // ============================================================
  // 文件选择回调
  // ============================================================

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      setSelectedFile(filePath);
      if (!workspaceId) return;

      setFileLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/file?id=${workspaceId}&subpath=${encodeURIComponent(filePath)}`
        );
        const data = await res.json();
        if (data.code === 200 && data.data?.content) {
          setFileContent(data.data.content);
        }
      } catch {
        setFileContent(`[无法加载文件: ${filePath}]`);
      } finally {
        setFileLoading(false);
      }
    },
    [workspaceId]
  );

  const handleWorkspaceChange = useCallback((id: string | null) => {
    setWorkspaceId(id);
    setSelectedFile(null);
    setFileContent("");
  }, []);

  // ============================================================
  // 分隔线拖拽
  // ============================================================

  const handleSplitterA = useCallback((delta: number) => {
    setLeftWidth((prev) => {
      const next = prev + delta;
      return Math.max(180, Math.min(480, next));
    });
  }, []);

  const handleSplitterB = useCallback((delta: number) => {
    setRightRatio((prev) => {
      const containerWidth = containerRef.current?.clientWidth ?? 1200;
      const ratioDelta = delta / containerWidth;
      const next = prev + ratioDelta;
      return Math.max(0.25, Math.min(0.75, next));
    });
  }, []);

  const toggleLeftPanel = () => {
    setLeftCollapsed((prev) => !prev);
  };

  // ============================================================
  // 聊天提交
  // ============================================================

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isLoading) return;

    sendMessage({ text: chatInput });
    setChatInput("");

    // 聊天后刷新文件树（可能有新文件生成）
    setRefreshToken((prev) => prev + 1);
  };

  const handleModelConfigChanged = () => {
    // 模型配置变更后刷新选择器
    setModelSwitchKey((prev) => prev + 1);
  };

  // ============================================================
  // 加载中
  // ============================================================

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // 渲染
  // ============================================================

  const actualLeftWidth = leftCollapsed ? 0 : leftWidth;

  return (
    <div className="flex h-full bg-slate-900 text-slate-100">
      {/* ==================== 左侧：工作空间树 ==================== */}
      {!leftCollapsed && (
        <div
          className="flex-shrink-0 h-full border-r border-slate-700 overflow-hidden"
          style={{ width: leftWidth }}
        >
          <WorkspaceTree
            workspaceId={workspaceId}
            onFileSelect={handleFileSelect}
            onWorkspaceChange={handleWorkspaceChange}
            refreshToken={refreshToken}
          />
        </div>
      )}

      {/* ==================== 分隔线 A ==================== */}
      {!leftCollapsed && <DraggableSplitter onDrag={handleSplitterA} />}

      {/* ==================== 中间 + 右侧容器 ==================== */}
      <div ref={containerRef} className="flex-1 flex min-w-0 h-full">
        {/* ==================== 中间：预览区 ==================== */}
        <div
          className="h-full flex flex-col border-r border-slate-700"
          style={{
            flex: leftCollapsed ? `1 1 ${(1 - rightRatio) * 100}%` : undefined,
            width: leftCollapsed
              ? undefined
              : `calc(${(1 - rightRatio) * 100}% - 2px)`,
          }}
        >
          {/* 预览区头部 */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-950">
            <div className="flex items-center gap-2">
              {/* 折叠按钮：折叠左侧栏 */}
              <button
                onClick={toggleLeftPanel}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors"
                title={leftCollapsed ? "展开工作空间" : "折叠工作空间"}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={
                      leftCollapsed
                        ? "M9 5l7 7-7 7"
                        : "M15 19l-7-7 7-7"
                    }
                  />
                </svg>
              </button>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                📝 预览区
              </h2>
            </div>
            {selectedFile && (
              <span className="text-xs text-slate-500 truncate ml-4 max-w-[50%]">
                {selectedFile}
              </span>
            )}
          </div>

          {/* 预览区内容 */}
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedFile && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-4xl mb-3">📂</p>
                  <p className="text-sm text-slate-500">
                    点击左侧文件树中的文件进行预览
                  </p>
                </div>
              </div>
            )}

            {selectedFile && fileLoading && (
              <div className="flex items-center justify-center h-full">
                <span className="text-slate-500 text-sm animate-pulse">
                  加载中...
                </span>
              </div>
            )}

            {selectedFile && !fileLoading && (
              <div>
                <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap break-all">
                  {fileContent}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* ==================== 分隔线 B ==================== */}
        <DraggableSplitter onDrag={handleSplitterB} />

        {/* ==================== 右侧：AI 聊天区 ==================== */}
        <div
          className="h-full flex flex-col"
          style={{
            flex: leftCollapsed
              ? `1 1 ${rightRatio * 100}%`
              : undefined,
            width: leftCollapsed
              ? undefined
              : `calc(${rightRatio * 100}% - 2px)`,
          }}
        >
          {/* 聊天区头部 */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-950">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                🤖 AI 控制台
              </h2>

              {/* ★ Phase 6: 模型选择器 */}
              <ModelSwitcher
                key={modelSwitchKey}
                selectedConfigId={selectedModelConfig?.id ?? null}
                onSelect={setSelectedModelConfig}
              />

              {/* 模型配置管理按钮 */}
              <button
                onClick={() => setModelConfigPanelOpen(true)}
                className="text-slate-500 hover:text-emerald-400 p-1 rounded transition-colors"
                title="管理模型配置"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {workspaceId && (
              <span className="text-[10px] text-slate-500 truncate max-w-[40%]">
                WS: {workspaceId.slice(0, 8)}...
              </span>
            )}
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-5xl mb-4">🧠</p>
                  <p className="text-lg font-bold text-emerald-400">
                    欢迎使用 Aura 智能体工作台
                  </p>
                  <p className="text-sm text-slate-500 mt-2">
                    试试输入: 帮我分析一下这条SQL的执行计划: SELECT * FROM
                    users
                  </p>
                </div>
              </div>
            )}

            {messages.map((m) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const msg = m as Record<string, any>;
              const textContent =
                typeof msg.content === "string"
                  ? msg.content
                  : msg.parts
                      ?.filter((p: { type: string }) => p.type === "text")
                      ?.map((p: { text: string }) => p.text)
                      ?.join("") ?? "";

              return (
                <div
                  key={m.id}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl p-3.5 ${
                      m.role === "user"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800 text-slate-100"
                    }`}
                  >
                    <span className="font-semibold block text-xs opacity-50 mb-1">
                      {m.role === "user" ? "YOU" : "AURA"}
                    </span>

                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {textContent && <p>{textContent}</p>}

                      {msg.parts?.map(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (part: Record<string, any>, i: number) => {
                          if (part.type === "tool-invocation") {
                            const ti = part.toolInvocation;
                            return (
                              <div
                                key={i}
                                className="mt-2 text-xs border border-dashed border-slate-600 p-2 rounded bg-slate-900"
                              >
                                <span className="text-amber-400 font-mono block mb-1">
                                  🔧 Tool: {ti?.toolName ?? "unknown"}
                                </span>
                                {ti?.result != null ? (
                                  <pre className="text-emerald-300 mt-1 overflow-x-auto max-h-40">
                                    {JSON.stringify(ti.result, null, 2)}
                                  </pre>
                                ) : (
                                  <span className="text-slate-400 animate-pulse block">
                                    执行中...
                                  </span>
                                )}
                              </div>
                            );
                          }
                          if (part.type === "reasoning") {
                            return (
                              <details
                                key={i}
                                className="mt-1 text-xs text-amber-400/70"
                              >
                                <summary className="cursor-pointer">
                                  💭 思考过程
                                </summary>
                                <p className="mt-1 italic">{part.text}</p>
                              </details>
                            );
                          }
                          return null;
                        }
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && messages.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                    <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:100ms]" />
                    <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:200ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 输入区 */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-slate-700 bg-slate-950"
          >
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  workspaceId
                    ? "给智能体下达指令 (支持 @文件名 引用)..."
                    : "请先创建或载入工作空间..."
                }
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 placeholder-slate-500 transition-colors"
                disabled={isLoading || !workspaceId}
              />
              <button
                type="submit"
                disabled={isLoading || !chatInput.trim() || !workspaceId}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
              >
                {isLoading ? "思考中..." : "发送"}
              </button>
              {isLoading && (
                <button
                  type="button"
                  onClick={stop}
                  className="bg-red-800/50 hover:bg-red-700/50 text-red-400 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  停止
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ★ Phase 6: 模型配置管理面板 */}
      <ModelConfigPanel
        open={modelConfigPanelOpen}
        onClose={() => setModelConfigPanelOpen(false)}
        onChanged={handleModelConfigChanged}
      />
    </div>
  );
}
