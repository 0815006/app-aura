"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useCallback, useRef, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceTree } from "@/components/agent/WorkspaceTree";
import { DraggableSplitter } from "@/components/agent/DraggableSplitter";
import { ModelSwitcher, type ModelConfigSafe } from "@/components/agent/ModelSwitcher";
import { ModelConfigPanel } from "@/components/agent/ModelConfigPanel";
import { StepTimeline, type TimelineStep } from "@/components/agent/StepTimeline";
import { UsageBadge } from "@/components/agent/UsageBadge";
import { RunDetailPanel } from "@/components/agent/RunDetailPanel";
import { useAuth } from "@/lib/auth/auth-context";

// ============================================================
// 会话摘要类型
// ============================================================
interface ChatSession {
  sessionId: string;
  title: string;
  messageCount: number;
  lastActivity: string;
}

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

// ============================================================
// localStorage 持久化 key
// ============================================================
const LS_KEYS = {
  workspaceId: "aura-workspace-id",
  leftWidth: "aura-left-width",
  rightRatio: "aura-right-ratio",
} as const;

/** 安全读取 localStorage（SSR 兼容） */
function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 格式化相对时间（如 "3 分钟前", "昨天 14:30"） */
function formatRelativeTime(isoStr: string): string {
  if (!isoStr) return "";
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString("zh-CN");
}

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

  // 工作空间（刷新后恢复）
  const [workspaceId, setWorkspaceId] = useState<string | null>(() =>
    readStored<string | null>(LS_KEYS.workspaceId, null)
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);

  // 左侧栏宽度（刷新后恢复，默认 240px）
  const [leftWidth, setLeftWidth] = useState(() =>
    readStored(LS_KEYS.leftWidth, 240)
  );
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // 中间预览区比例（刷新后恢复，默认 50%）
  const [rightRatio, setRightRatio] = useState(() =>
    readStored(LS_KEYS.rightRatio, 0.5)
  );
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

  // ★ 会话（Session）管理
  const [chatId, setChatId] = useState<string | null>(null); // 当前活跃会话 ID
  const [sessionTitle, setSessionTitle] = useState<string>(""); // 当前会话标题
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [allSessionsModalOpen, setAllSessionsModalOpen] = useState(false);
  const [allSessions, setAllSessions] = useState<ChatSession[]>([]);
  const [allSessionsLoading, setAllSessionsLoading] = useState(false);

  // ★ ref 追踪最新 workspaceId / modelConfig / chatId，使 transport body 函数能读到当前值
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const modelConfigRef = useRef(selectedModelConfig);
  modelConfigRef.current = selectedModelConfig;
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  // ★ 自动滚动 & 实时步骤追踪
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [liveSteps, setLiveSteps] = useState<TimelineStep[]>([]);

  // ★ Run 详情 & 用量追踪
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { messages, sendMessage, status, stop, setMessages } = useChat({
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
        if (chatIdRef.current) {
          extra.chatId = chatIdRef.current;
        }
        return extra;
      },
    }),
  } as any);

  const isLoading = status === "submitted" || status === "streaming";

  // ★ 追踪 status 变化，在 streaming→ready 时刷新 token 用量
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    // streaming → ready 转换：刷新最近任务列表（含最新 Run 数据）
    if (prev === "streaming" && status === "ready") {
      fetchRecentSessions();
      // ★ 异步拉取最新 Run 的 token 用量
      fetchLatestRunTokens();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ★ 自动滚动到最新消息
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ★ 实时提取当前正在执行的步骤（从最后一条 assistant 消息的 parts）
  useEffect(() => {
    if (!isLoading || messages.length === 0) {
      if (!isLoading) setLiveSteps([]);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastMsg = messages[messages.length - 1] as Record<string, any>;
    if (lastMsg?.role !== "assistant") return;
    const parts = lastMsg.parts;
    if (!Array.isArray(parts)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const steps: TimelineStep[] = [];
    parts.forEach((part: Record<string, any>, i: number) => {
      if (part.type === "tool-invocation") {
        const ti = part.toolInvocation;
        steps.push({
          index: i,
          type: "tool-call",
          toolName: ti?.toolName ?? "unknown",
          toolArgs: ti?.args,
          toolResult: ti?.result,
          state: ti?.state ?? "call",
        });
      }
      if (part.type === "reasoning") {
        steps.push({
          index: i,
          type: "thought",
          text: part.text,
          state: "done",
        });
      }
    });
    setLiveSteps(steps);
  }, [messages, isLoading]);

  // ★ 从最新 Run 刷新 token 用量
  const fetchLatestRunTokens = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(
        `/api/workspaces/runs?workspaceId=${workspaceId}&limit=1`
      );
      const data = await res.json();
      if (data.code === 200 && data.data?.runs?.length > 0) {
        const run = data.data.runs[0];
        setSessionTokens({
          promptTokens: run.promptTokens ?? 0,
          completionTokens: run.completionTokens ?? 0,
          totalTokens: run.totalTokens ?? 0,
        });
      }
    } catch {
      // 静默失败
    }
  }, [workspaceId]);

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
    setChatId(null);
    chatIdRef.current = null;
    setSessionTitle("");
    setMessages([]);
    setRecentSessions([]);
    setSelectedRunId(null);
    setSessionTokens({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  }, [setMessages]);

  // ============================================================
  // 会话管理：加载最近任务 & 切换会话
  // ============================================================

  /** 加载当前工作空间的最近 3 次会话 */
  const fetchRecentSessions = useCallback(async () => {
    if (!workspaceId) {
      setRecentSessions([]);
      return;
    }
    setSessionsLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/chat-sessions?workspaceId=${workspaceId}&limit=3`
      );
      const data = await res.json();
      if (data.code === 200 && Array.isArray(data.data)) {
        setRecentSessions(data.data as ChatSession[]);
      }
    } catch {
      // 静默失败
    } finally {
      setSessionsLoading(false);
    }
  }, [workspaceId]);

  /** 加载全部会话（查看全部模态框） */
  const fetchAllSessions = useCallback(async () => {
    if (!workspaceId) return;
    setAllSessionsLoading(true);
    setAllSessionsModalOpen(true);
    try {
      const res = await fetch(
        `/api/workspaces/chat-sessions?workspaceId=${workspaceId}&all=1`
      );
      const data = await res.json();
      if (data.code === 200 && Array.isArray(data.data)) {
        setAllSessions(data.data as ChatSession[]);
      }
    } catch {
      // 静默失败
    } finally {
      setAllSessionsLoading(false);
    }
  }, [workspaceId]);

  /** 点击会话卡片：加载历史消息并恢复为活跃会话，可继续聊天 */
  const handleSessionClick = useCallback(
    async (sessionId: string, title?: string) => {
      if (!workspaceId) return;
      setChatId(sessionId);
      chatIdRef.current = sessionId;
      if (title) setSessionTitle(title);
      try {
        const res = await fetch(
          `/api/workspaces/chat-messages?workspaceId=${workspaceId}&sessionId=${sessionId}`
        );
        const data = await res.json();
        if (data.code === 200 && Array.isArray(data.data)) {
          // 将 DB 历史消息转换为 AI SDK UIMessage 格式，注入 useChat
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const uiMessages = (data.data as any[]).map((m: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parts: any[] = [
              { type: "text" as const, text: m.content ?? "" },
            ];

            // ★ 将 DB 中的 toolCalls JSON 转换为 UI parts
            // StepTimeline 通过这些 parts 渲染历史工具调用步骤
            if (m.toolCalls && Array.isArray(m.toolCalls)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const tc of m.toolCalls as any[]) {
                parts.push({
                  type: "tool-invocation" as const,
                  toolInvocation: {
                    toolName: tc.toolName ?? "unknown",
                    args: tc.args ?? {},
                    result: tc.result ?? null,
                    state: "result" as const,
                  },
                });
              }
            }

            return {
              id: String(m.id),
              role: m.role as "user" | "assistant",
              parts,
              createdAt: m.createTime ? new Date(m.createTime) : new Date(),
            };
          });
          setMessages(uiMessages);

          // ★ 同时加载该会话的最新 Run 的 token 用量
          fetchLatestRunTokensForSession(sessionId);
        }
      } catch {
        // 静默失败
      }
    },
    [workspaceId, setMessages]
  );

  /** 从指定会话加载最新 Run 的 token 用量 */
  const fetchLatestRunTokensForSession = useCallback(
    async (sessionId: string) => {
      if (!workspaceId) return;
      try {
        const res = await fetch(
          `/api/workspaces/runs?workspaceId=${workspaceId}&sessionId=${sessionId}&limit=1`
        );
        const data = await res.json();
        if (data.code === 200 && data.data?.runs?.length > 0) {
          const run = data.data.runs[0];
          setSessionTokens({
            promptTokens: run.promptTokens ?? 0,
            completionTokens: run.completionTokens ?? 0,
            totalTokens: run.totalTokens ?? 0,
          });
        }
      } catch {
        // 静默失败
      }
    },
    [workspaceId]
  );

  /** 开启新对话：清空 chatId 和消息列表 */
  const handleNewChat = useCallback(() => {
    setChatId(null);
    chatIdRef.current = null;
    setSessionTitle("");
    setMessages([]);
    setLiveSteps([]);
    setSessionTokens({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    setSelectedRunId(null);
  }, [setMessages]);

  /** 查看会话对应的最新 Run 详情（在预览区展示） */
  const handleViewRunDetail = useCallback(
    async (sessionId: string) => {
      if (!workspaceId) return;
      try {
        const res = await fetch(
          `/api/workspaces/runs?workspaceId=${workspaceId}&sessionId=${sessionId}&limit=1`
        );
        const data = await res.json();
        if (data.code === 200 && data.data?.runs?.length > 0) {
          setSelectedRunId(data.data.runs[0].id);
        }
      } catch {
        // 静默失败
      }
    },
    [workspaceId]
  );

  // 工作空间变更时刷新最近任务列表
  useEffect(() => {
    fetchRecentSessions();
  }, [fetchRecentSessions]);

  // ============================================================
  // 分隔线拖拽
  // ============================================================

  const handleSplitterA = useCallback((delta: number) => {
    setLeftWidth((prev) => {
      const next = prev + delta;
      return Math.max(180, Math.min(480, next));
    });
  }, []);

  // 分隔线 B：预览区 ↔ 聊天区
  // 向右拖（delta>0）→ 预览区变宽、聊天区变窄 → rightRatio 减小
  // 向左拖（delta<0）→ 预览区变窄、聊天区变宽 → rightRatio 增大
  const handleSplitterB = useCallback((delta: number) => {
    setRightRatio((prev) => {
      const containerWidth = containerRef.current?.clientWidth ?? 1200;
      const ratioDelta = delta / containerWidth;
      const next = prev - ratioDelta;
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

    // ★ 新对话自动生成 chatId（服务端 onFinish 用此 session 标识持久化）
    const currentChatId = chatIdRef.current ?? crypto.randomUUID();
    if (!chatIdRef.current) {
      chatIdRef.current = currentChatId;
      setChatId(currentChatId);
      // 新会话：用第一条用户消息作为标题
      setSessionTitle(chatInput.trim().slice(0, 60));
    }

    sendMessage({ text: chatInput });
    setChatInput("");

    // 聊天后刷新文件树（可能有新文件生成）
    setRefreshToken((prev) => prev + 1);

    // 延迟刷新最近任务列表（等 onFinish 持久化完成）
    setTimeout(() => {
      fetchRecentSessions();
    }, 1500);
  };

  const handleModelConfigChanged = () => {
    // 模型配置变更后刷新选择器
    setModelSwitchKey((prev) => prev + 1);
  };

  // ============================================================
  // 持久化：localStorage 同步
  // ============================================================

  // 工作空间 ID 变更时立即写入（离散操作，无需防抖）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (workspaceId) {
        localStorage.setItem(LS_KEYS.workspaceId, JSON.stringify(workspaceId));
      } else {
        localStorage.removeItem(LS_KEYS.workspaceId);
      }
    } catch {
      // 存储不可用时静默忽略
    }
  }, [workspaceId]);

  // 分隔线拖拽期间 leftWidth 更新频繁，200ms 防抖写入
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEYS.leftWidth, JSON.stringify(leftWidth));
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [leftWidth]);

  // 分隔线拖拽期间 rightRatio 更新频繁，200ms 防抖写入
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEYS.rightRatio, JSON.stringify(rightRatio));
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [rightRatio]);

  // ============================================================
  // 加载中
  // ============================================================

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-aura-surface">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-aura-text-muted">加载中...</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // 渲染
  // ============================================================

  const actualLeftWidth = leftCollapsed ? 0 : leftWidth;

  return (
    <div className="flex h-full bg-aura-surface text-aura-text">
      {/* ==================== 左侧：工作空间树 ==================== */}
      {!leftCollapsed && (
        <div
          className="flex-shrink-0 h-full border-r border-aura-border overflow-hidden"
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
          className="h-full flex flex-col border-r border-aura-border"
          style={{
            flex: leftCollapsed ? `1 1 ${(1 - rightRatio) * 100}%` : undefined,
            width: leftCollapsed
              ? undefined
              : `calc(${(1 - rightRatio) * 100}% - 2px)`,
          }}
        >
          {/* 预览区头部 */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-aura-border bg-aura-bg">
            <div className="flex items-center gap-2">
              {/* 折叠按钮：折叠左侧栏 */}
              <button
                onClick={toggleLeftPanel}
                className="text-aura-text-secondary hover:text-aura-text p-1 rounded hover:bg-aura-hover transition-colors"
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
              <h2 className="text-xs font-bold text-aura-text-secondary uppercase tracking-wider">
                📝 预览区
              </h2>
            </div>
            {selectedFile && (
              <span className="text-xs text-aura-text-muted truncate ml-4 max-w-[50%]">
                {selectedFile}
              </span>
            )}
          </div>

          {/* 预览区内容 */}
          <div className="flex-1 overflow-y-auto">
            {/* ★ Run 详情模式 */}
            {selectedRunId ? (
              <RunDetailPanel runId={selectedRunId} />
            ) : !selectedFile ? (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-center">
                  <p className="text-4xl mb-3">📂</p>
                  <p className="text-sm text-aura-text-muted">
                    点击左侧文件树中的文件进行预览
                  </p>
                </div>
              </div>
            ) : fileLoading ? (
              <div className="flex items-center justify-center h-full p-4">
                <span className="text-aura-text-muted text-sm animate-pulse">
                  加载中...
                </span>
              </div>
            ) : (
              <div className="p-4">
                <pre className="text-sm text-aura-text font-mono whitespace-pre-wrap break-all">
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
          {/* ========== 会话标题栏（活跃会话时显示） ========== */}
          {chatId && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-aura-border bg-aura-bg/80">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* 会话图标 */}
                <span className="text-sm flex-shrink-0">💬</span>
                {/* 会话标题 */}
                <h3
                  className="text-sm font-semibold text-aura-text truncate"
                  title={sessionTitle || "未命名会话"}
                >
                  {sessionTitle || "未命名会话"}
                </h3>
                {/* 会话 ID 小标签 */}
                <span className="text-[10px] text-aura-text-dim flex-shrink-0 hidden sm:inline">
                  #{chatId.slice(0, 8)}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {/* 新对话按钮 */}
                <button
                  onClick={handleNewChat}
                  className="text-[10px] text-aura-text-muted hover:text-emerald-400 bg-aura-surface border border-aura-border rounded px-2 py-0.5 transition-colors"
                  title="新建对话"
                >
                  + 新建
                </button>
                {/* 关闭会话按钮 */}
                <button
                  onClick={handleNewChat}
                  className="text-aura-text-muted hover:text-red-400 p-1.5 rounded hover:bg-aura-hover transition-colors"
                  title="关闭当前会话"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ========== 控制栏（始终显示） ========== */}
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-aura-border bg-aura-bg">
            <div className="flex items-center gap-3">
              <img src="/aura.svg" alt="Aura" className="w-4 h-4 flex-shrink-0" />
              <h2 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                AI 控制台
              </h2>

              {/* ★ 模型选择器 */}
              <ModelSwitcher
                key={modelSwitchKey}
                selectedConfigId={selectedModelConfig?.id ?? null}
                onSelect={setSelectedModelConfig}
              />

              {/* 模型配置管理按钮 */}
              <button
                onClick={() => setModelConfigPanelOpen(true)}
                className="text-aura-text-muted hover:text-emerald-400 p-1 rounded transition-colors"
                title="管理模型配置"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* ★ 用量展示 */}
              <UsageBadge
                totalTokens={sessionTokens.totalTokens}
                promptTokens={sessionTokens.promptTokens}
                completionTokens={sessionTokens.completionTokens}
                modelName={selectedModelConfig?.modelName}
              />
            </div>

            {workspaceId && (
              <span className="text-[10px] text-aura-text-muted truncate max-w-[40%]">
                WS: {workspaceId.slice(0, 8)}...
              </span>
            )}
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col">
                {/* ========== 欢迎横幅 ========== */}
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <img src="/aura.svg" alt="Aura" className="w-20 h-20 mx-auto mb-4" />
                    <p className="text-lg font-bold text-emerald-400">
                      欢迎使用 Aura 智能体工作台
                    </p>
                    <p className="text-sm text-aura-text-muted mt-2">
                      试试输入: 帮我分析一下这条SQL的执行计划: SELECT * FROM
                      users
                    </p>
                  </div>
                </div>

                {/* ========== 最近任务 ========== */}
                {workspaceId && (
                  <div className="border-t border-aura-border pt-4 mt-2">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-aura-text-secondary uppercase tracking-wider">
                        🕐 最近任务
                      </span>
                      {recentSessions.length > 0 && (
                        <button
                          onClick={fetchAllSessions}
                          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          查看全部 →
                        </button>
                      )}
                    </div>

                    {sessionsLoading && (
                      <div className="flex items-center justify-center py-4">
                        <span className="text-xs text-aura-text-muted animate-pulse">
                          加载中...
                        </span>
                      </div>
                    )}

                    {!sessionsLoading && recentSessions.length === 0 && (
                      <p className="text-xs text-aura-text-muted py-2">
                        暂无历史对话，发送消息开始第一次任务
                      </p>
                    )}

                    {!sessionsLoading &&
                      recentSessions.map((s) => (
                        <button
                          key={s.sessionId}
                          onClick={() => handleSessionClick(s.sessionId, s.title)}
                          className={`w-full text-left p-3 rounded-lg mb-2 transition-colors border ${
                            chatId === s.sessionId
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-aura-border bg-aura-bg hover:bg-aura-hover"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-aura-text truncate">
                                {s.title}
                              </p>
                              <p className="text-[10px] text-aura-text-muted mt-1">
                                {s.messageCount} 条消息
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewRunDetail(s.sessionId);
                                }}
                                className="text-[10px] text-aura-text-muted hover:text-emerald-400 transition-colors px-1 py-0.5 rounded cursor-pointer"
                                title="查看运行详情（Token 用量、步骤时间线）"
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    handleViewRunDetail(s.sessionId);
                                  }
                                }}
                              >
                                📋
                              </span>
                              <span className="text-[10px] text-aura-text-muted">
                                {formatRelativeTime(s.lastActivity)}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
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
                        : "bg-aura-hover text-aura-text"
                    }`}
                  >
                    <span className="font-semibold block text-xs opacity-50 mb-1">
                      {m.role === "user" ? "YOU" : "AURA"}
                    </span>

                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {textContent && <p>{textContent}</p>}

                      {/* ★ StepTimeline: 步骤时间线 */}
                      {(() => {
                        if (!msg.parts) return null;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const steps: TimelineStep[] = [];
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (msg.parts as Record<string, any>[]).forEach(
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (part: Record<string, any>, i: number) => {
                            if (part.type === "tool-invocation") {
                              const ti = part.toolInvocation;
                              steps.push({
                                index: i,
                                type: "tool-call",
                                toolName: ti?.toolName ?? "unknown",
                                toolArgs: ti?.args,
                                toolResult: ti?.result,
                                state: ti?.state ?? "result",
                              });
                            }
                            if (part.type === "reasoning") {
                              steps.push({
                                index: i,
                                type: "thought",
                                text: part.text,
                                state: "done",
                              });
                            }
                          }
                        );
                        return <StepTimeline steps={steps} />;
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && messages.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-aura-hover rounded-xl p-3.5 max-w-[85%]">
                  {/* ★ 实时步骤时间线 */}
                  {liveSteps.length > 0 && (
                    <div className="mb-3">
                      <StepTimeline steps={liveSteps} isStreaming={true} />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                    <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:100ms]" />
                    <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:200ms]" />
                    <span className="text-xs text-aura-text-muted ml-1">
                      智能体执行中...
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ★ 自动滚动锚点 */}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区 */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-aura-border bg-aura-bg"
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
                className="flex-1 bg-aura-hover border border-aura-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-aura-text placeholder-aura-text-muted transition-colors"
                disabled={isLoading || !workspaceId}
              />
              <button
                type="submit"
                disabled={isLoading || !chatInput.trim() || !workspaceId}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-aura-hover disabled:text-aura-text-muted text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
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

      {/* ==================== 查看全部会话模态框 ==================== */}
      {allSessionsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setAllSessionsModalOpen(false)}
        >
          <div
            className="bg-aura-bg border border-aura-border rounded-xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 模态框头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-aura-border">
              <h3 className="text-sm font-bold text-aura-text">
                📋 全部历史对话
              </h3>
              <button
                onClick={() => setAllSessionsModalOpen(false)}
                className="text-aura-text-muted hover:text-aura-text p-1 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 模态框内容 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {allSessionsLoading && (
                <div className="flex items-center justify-center py-8">
                  <span className="text-sm text-aura-text-muted animate-pulse">
                    加载中...
                  </span>
                </div>
              )}

              {!allSessionsLoading && allSessions.length === 0 && (
                <p className="text-sm text-aura-text-muted text-center py-8">
                  暂无历史对话
                </p>
              )}

              {!allSessionsLoading &&
                allSessions.map((s) => (
                  <button
                    key={s.sessionId}
                    onClick={() => {
                      setAllSessionsModalOpen(false);
                      handleSessionClick(s.sessionId, s.title);
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-colors border ${
                      chatId === s.sessionId
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-aura-border hover:bg-aura-hover"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-aura-text truncate">
                          {s.title}
                        </p>
                        <p className="text-[10px] text-aura-text-muted mt-1">
                          {s.messageCount} 条消息
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setAllSessionsModalOpen(false);
                            handleViewRunDetail(s.sessionId);
                          }}
                          className="text-[10px] text-aura-text-muted hover:text-emerald-400 transition-colors px-1 py-0.5 rounded cursor-pointer"
                          title="查看运行详情"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              setAllSessionsModalOpen(false);
                              handleViewRunDetail(s.sessionId);
                            }
                          }}
                        >
                          📋
                        </span>
                        <span className="text-[10px] text-aura-text-muted">
                          {formatRelativeTime(s.lastActivity)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
