"use client";

import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

// ============================================================
// 类型定义
// ============================================================

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  status: string;
  createTime: string;
  updateTime: string;
}

// ============================================================
// Props
// ============================================================

interface WorkspaceTreeProps {
  workspaceId: string | null;
  onFileSelect: (filePath: string) => void;
  onWorkspaceChange: (id: string | null) => void;
  /** 新增文件/目录后触发的刷新标记 */
  refreshToken?: number;
}

// ============================================================
// 组件
// ============================================================

export function WorkspaceTree({
  workspaceId,
  onFileSelect,
  onWorkspaceChange,
  refreshToken,
}: WorkspaceTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirChildren, setDirChildren] = useState<
    Record<string, FileEntry[]>
  >({});

  // 工作空间管理弹窗
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [workspaceList, setWorkspaceList] = useState<WorkspaceInfo[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry;
  } | null>(null);

  // ============================================================
  // 加载根目录
  // ============================================================

  const loadRoot = useCallback(async () => {
    if (!workspaceId) {
      setEntries([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await api.get<{ path: string; entries: FileEntry[] }>(
        `/api/workspaces/tree?id=${workspaceId}`
      );
      if (res.code === 200 && res.data) {
        setEntries(res.data.entries);
      } else {
        setError(res.message);
      }
    } catch {
      setError("加载目录失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot, refreshToken]);

  // ============================================================
  // 加载子目录
  // ============================================================

  const toggleDir = useCallback(
    async (entry: FileEntry) => {
      if (!entry.isDirectory || !workspaceId) return;

      const dirKey = entry.path;

      if (expandedDirs.has(dirKey)) {
        // 折叠
        const next = new Set(expandedDirs);
        next.delete(dirKey);
        setExpandedDirs(next);
        return;
      }

      // 展开：如果已缓存则直接用，否则请求
      if (dirChildren[dirKey]) {
        const next = new Set(expandedDirs);
        next.add(dirKey);
        setExpandedDirs(next);
        return;
      }

      try {
        const res = await api.get<{ path: string; entries: FileEntry[] }>(
          `/api/workspaces/tree?id=${workspaceId}&subpath=${encodeURIComponent(dirKey)}`
        );
        if (res.code === 200 && res.data) {
          setDirChildren((prev) => ({ ...prev, [dirKey]: res.data!.entries }));
          const next = new Set(expandedDirs);
          next.add(dirKey);
          setExpandedDirs(next);
        }
      } catch {
        // ignore
      }
    },
    [workspaceId, expandedDirs, dirChildren]
  );

  // ============================================================
  // 工作空间列表加载
  // ============================================================

  const loadWorkspaceList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.get<WorkspaceInfo[]>("/api/workspaces");
      if (res.code === 200 && res.data) {
        setWorkspaceList(res.data);
      }
    } catch {
      // ignore
    } finally {
      setListLoading(false);
    }
  }, []);

  const handleLoadClick = () => {
    setShowLoadDialog(true);
    loadWorkspaceList();
  };

  const handleCreateWorkspace = async () => {
    if (!newName.trim()) return;

    try {
      const res = await api.post<WorkspaceInfo>("/api/workspaces", {
        name: newName.trim(),
      });
      if (res.code === 200 && res.data) {
        onWorkspaceChange(res.data.id);
        setShowCreateDialog(false);
        setNewName("");
      }
    } catch {
      // ignore
    }
  };

  const handleSelectWorkspace = (id: string) => {
    onWorkspaceChange(id);
    setShowLoadDialog(false);
  };

  const handleExitWorkspace = () => {
    onWorkspaceChange(null);
    setEntries([]);
    setDirChildren({});
    setExpandedDirs(new Set());
  };

  // ============================================================
  // 右键菜单
  // ============================================================

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const closeContextMenu = () => setContextMenu(null);

  // ============================================================
  // 递归渲染树节点
  // ============================================================

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isExpanded = expandedDirs.has(entry.path);
    const children = dirChildren[entry.path] || [];

    return (
      <React.Fragment key={entry.path}>
        <div
          className="flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer hover:bg-slate-800 text-xs group transition-colors"
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => {
            if (entry.isDirectory) {
              toggleDir(entry);
            } else {
              onFileSelect(entry.path);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, entry)}
        >
          {/* 展开/折叠箭头 */}
          {entry.isDirectory && (
            <span className="w-3 text-slate-500 flex-shrink-0 text-center">
              {isExpanded ? "▼" : "▶"}
            </span>
          )}
          {!entry.isDirectory && <span className="w-3 flex-shrink-0" />}

          {/* 图标 */}
          <span className="flex-shrink-0">
            {entry.isDirectory ? "📁" : "📄"}
          </span>

          {/* 文件名 */}
          <span
            className={`truncate ${
              entry.isDirectory
                ? "text-slate-300 font-medium"
                : "text-slate-400"
            }`}
            title={entry.name}
          >
            {entry.name}
          </span>

          {/* 文件大小 */}
          {entry.isFile && entry.size !== undefined && (
            <span className="text-slate-600 text-[10px] ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              {formatSize(entry.size)}
            </span>
          )}
        </div>

        {/* 展开的子目录 */}
        {entry.isDirectory && isExpanded && (
          <div>
            {children.length === 0 && (
              <div
                className="text-slate-600 text-xs py-0.5"
                style={{ paddingLeft: 8 + (depth + 1) * 16 }}
              >
                (空目录)
              </div>
            )}
            {children.map((child) => renderEntry(child, depth + 1))}
          </div>
        )}
      </React.Fragment>
    );
  };

  // ============================================================
  // 主渲染
  // ============================================================

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* 标题 */}
      <div className="px-3 py-2 border-b border-slate-800">
        <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
          📁 工作空间
        </h2>
      </div>

      {/* 文件树 */}
      <div className="flex-1 overflow-y-auto py-1">
        {!workspaceId && (
          <div className="text-center py-8 px-3">
            <p className="text-slate-500 text-xs">
              暂无工作空间
            </p>
            <p className="text-slate-600 text-[10px] mt-1">
              点击下方按钮新建或载入
            </p>
          </div>
        )}

        {workspaceId && loading && (
          <div className="text-center py-4">
            <span className="text-slate-500 text-xs animate-pulse">
              加载中...
            </span>
          </div>
        )}

        {workspaceId && error && (
          <div className="text-center py-4 px-3">
            <p className="text-red-400 text-xs">{error}</p>
            <button
              onClick={loadRoot}
              className="text-emerald-400 text-xs mt-1 underline"
            >
              重试
            </button>
          </div>
        )}

        {workspaceId &&
          !loading &&
          !error &&
          entries.length === 0 && (
            <div className="text-center py-4 px-3">
              <p className="text-slate-500 text-xs">
                目录为空
              </p>
              <p className="text-slate-600 text-[10px] mt-1">
                让 AI Agent 帮你创建文件吧
              </p>
            </div>
          )}

        {workspaceId && !loading && !error && entries.map((e) => renderEntry(e))}
      </div>

      {/* 底部操作按钮 */}
      <div className="border-t border-slate-800 p-2 space-y-1">
        {workspaceId ? (
          <button
            onClick={handleExitWorkspace}
            className="w-full text-xs text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded px-2 py-1.5 text-left transition-colors"
          >
            ↩ 退出工作空间
          </button>
        ) : (
          <>
            <button
              onClick={handleLoadClick}
              className="w-full text-xs text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded px-2 py-1.5 text-left transition-colors"
            >
              📂 载入工作空间
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="w-full text-xs text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded px-2 py-1.5 text-left transition-colors"
            >
              ✨ 新建工作空间
            </button>
          </>
        )}
      </div>

      {/* ================================================ */}
      {/* 新建工作空间弹窗 */}
      {/* ================================================ */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-lg font-bold text-emerald-400 mb-4">
              ✨ 新建工作空间
            </h3>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="输入工作空间名称..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 mb-4"
              onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewName("");
                }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newName.trim()}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================ */}
      {/* 载入工作空间弹窗 */}
      {/* ================================================ */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-96 shadow-2xl max-h-[70vh] flex flex-col">
            <h3 className="text-lg font-bold text-emerald-400 mb-4">
              📂 载入工作空间
            </h3>

            <div className="flex-1 overflow-y-auto space-y-1">
              {listLoading && (
                <p className="text-slate-500 text-sm text-center py-4">
                  加载中...
                </p>
              )}
              {!listLoading && workspaceList.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-4">
                  暂无可用工作空间
                </p>
              )}
              {!listLoading &&
                workspaceList.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSelectWorkspace(ws.id)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <p className="text-sm text-slate-200">{ws.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {ws.id} ·{" "}
                      {new Date(ws.updateTime).toLocaleString("zh-CN")}
                    </p>
                  </button>
                ))}
            </div>

            <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowLoadDialog(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================ */}
      {/* 右键菜单（简化版） */}
      {/* ================================================ */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={closeContextMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeContextMenu();
            }}
          />
          <div
            className="fixed z-50 bg-slate-800 border border-slate-700 rounded-lg py-1 shadow-xl min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <p className="px-3 py-1 text-[10px] text-slate-500 uppercase">
              {contextMenu.entry.name}
            </p>
            <div className="border-t border-slate-700 mt-1" />
            <button
              onClick={() => {
                onFileSelect(contextMenu.entry.path);
                closeContextMenu();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              📄 打开文件
            </button>
            <button
              onClick={closeContextMenu}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-700 transition-colors"
            >
              📋 复制路径
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// 辅助函数
// ============================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
