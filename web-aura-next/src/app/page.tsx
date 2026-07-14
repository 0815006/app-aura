"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, type FormEvent } from "react";

/**
 * Aura 智能体工作台主页
 * 左侧文件空间 + 右侧控制台 的 flex 子布局，不破坏外层 Grid 骨架。
 */

export default function AgentWorkbench() {
  const [chatInput, setChatInput] = useState("");

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isLoading) return;
    sendMessage({ text: chatInput });
    setChatInput("");
  };

  return (
    <div className="flex h-full bg-slate-900 text-slate-100">
      {/* ===== 左侧文件空间 ===== */}
      <aside className="w-56 border-r border-slate-700 p-3 flex flex-col bg-slate-950">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          📁 文件空间
        </h2>
        <div className="flex-1 overflow-y-auto">
          <div className="text-xs text-slate-600 space-y-1">
            <p className="text-slate-500 font-medium">docs/</p>
            <p className="pl-3">├── 开工第一步PRD.md</p>
            <p className="pl-3 text-slate-700">└── (空目录)</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-600">
            支持 @文件名 语法引用文件
          </p>
        </div>
      </aside>

      {/* ===== 右侧聊天控制台 ===== */}
      <div className="flex-1 flex flex-col min-w-0">
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
                  试试输入: 帮我分析一下这条SQL的执行计划: SELECT * FROM users
                </p>
              </div>
            </div>
          )}

          {messages.map((m) => {
            // AI SDK v7 中 UIMessage 使用 parts 数组
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
                  className={`max-w-[80%] rounded-xl p-3.5 ${
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
              placeholder="给智能体下达指令 (例如: 帮我分析下这条SQL的执行计划: SELECT * FROM users)。支持 @文件名 引用..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 placeholder-slate-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !chatInput.trim()}
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
  );
}
