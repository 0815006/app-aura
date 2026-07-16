"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type KeyboardEvent,
} from "react";

// ============================================================
// @file: 标记的正则 — 匹配 @file:路径 格式
// ============================================================

const FILE_MENTION_RE = /@file:(\S+)/g;

// ============================================================
// 类型
// ============================================================

interface FileEntry {
  name: string;
  path: string;
}

export interface FileMentionInputHandle {
  submit: () => void;
  getValue: () => string;
}

interface FileMentionInputProps {
  placeholder?: string;
  disabled?: boolean;
  workspaceId: string | null;
  onSubmit: (value: string) => void;
  clearToken?: number;
}

/** 解析后的输入片段 */
type Segment =
  | { kind: "text"; value: string }
  | { kind: "mention"; filePath: string; fileName: string };

// ============================================================
// 组件
// ============================================================

export const FileMentionInput = forwardRef<
  FileMentionInputHandle,
  FileMentionInputProps
>(function FileMentionInput(
  {
    placeholder = "给智能体下达指令...",
    disabled = false,
    workspaceId,
    onSubmit,
    clearToken = 0,
  },
  ref
) {
  // ---- 文本值 ----
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- 扁平文件列表 ----
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);

  // ---- @ 提及状态 ----
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [filteredFiles, setFilteredFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  /** @ 符号在 value 中的位置 */
  const mentionAtPosRef = useRef(-1);

  // ---- refs ----
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // ============================================================
  // 加载扁平文件列表
  // ============================================================

  useEffect(() => {
    if (!workspaceId) {
      setAllFiles([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/workspaces/files-flat?id=${workspaceId}`
        );
        const data = await res.json();
        if (!cancelled && data.code === 200 && data.data?.files) {
          setAllFiles(data.data.files as FileEntry[]);
        }
      } catch {
        // 静默失败
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // ============================================================
  // 清空输入
  // ============================================================

  useEffect(() => {
    if (clearToken > 0) {
      setValue("");
    }
  }, [clearToken]);

  // ============================================================
  // 点击外部关闭下拉
  // ============================================================

  useEffect(() => {
    if (!showDropdown) return;

    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  // ============================================================
  // 过滤文件（前缀匹配）
  // ============================================================

  useEffect(() => {
    if (!showDropdown) return;

    const q = mentionQuery.toLowerCase();
    if (!q) {
      setFilteredFiles(allFiles.slice(0, 50));
    } else {
      const matched = allFiles.filter(
        (f) =>
          f.name.toLowerCase().startsWith(q) ||
          f.path.toLowerCase().includes(q)
      );
      setFilteredFiles(matched.slice(0, 50));
    }
    setSelectedIndex(0);
  }, [mentionQuery, allFiles, showDropdown]);

  // ============================================================
  // 检测 textarea 光标前的 @ 查询
  // ============================================================

  const detectMentionAtCursor = useCallback(
    (text: string, cursorPos: number) => {
      // 从光标位置向前找最近的 @
      const beforeCursor = text.slice(0, cursorPos);
      const atIndex = beforeCursor.lastIndexOf("@");

      if (atIndex === -1) return null;

      // @ 必须在行首或前面是空格
      if (atIndex > 0 && beforeCursor[atIndex - 1] !== " ") {
        return null;
      }

      const query = beforeCursor.slice(atIndex + 1);
      // query 中不能包含空格（否则说明 @ 查询已结束）
      if (query.includes(" ") || query.includes("\n")) {
        return null;
      }

      // 不能是 @file: 格式（已选中的文件标记）
      if (query.startsWith("file:")) {
        return null;
      }

      return { atIndex, query };
    },
    []
  );

  // ============================================================
  // 选择文件：替换 @query → @file:path
  // ============================================================

  const selectFile = useCallback(
    (file: FileEntry) => {
      const atPos = mentionAtPosRef.current;
      if (atPos < 0) return;

      const ta = textareaRef.current;
      if (!ta) return;

      const cursorPos = ta.selectionStart;
      const mentionStr = `@file:${file.path}`;

      // 替换 value 中的 @query → @file:path
      const newValue =
        value.slice(0, atPos) +
        mentionStr +
        value.slice(cursorPos);

      // 如果有后续文字，在 @file:path 后加一个空格
      const needSpace =
        cursorPos < value.length && value[cursorPos] !== " ";

      setValue(newValue + (needSpace ? " " : ""));
      setShowDropdown(false);
      setMentionQuery("");
      mentionAtPosRef.current = -1;

      // 恢复焦点并移动光标到插入文本之后
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = atPos + mentionStr.length + (needSpace ? 1 : 0);
        ta.setSelectionRange(newPos, newPos);
      });
    },
    [value]
  );

  // ============================================================
  // 提交
  // ============================================================

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmitRef.current(trimmed);
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      submit: handleSubmit,
      getValue: () => value.trim(),
    }),
    [handleSubmit, value]
  );

  // ============================================================
  // textarea 值变更（只更新 value，mention 检测统一在 handleKeyUp 中处理）
  // ============================================================

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
    },
    []
  );

  // ============================================================
  // keyUp：在 DOM 完全更新后检测 @mention
  // ============================================================

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      const detected = detectMentionAtCursor(ta.value, ta.selectionStart);
      if (detected) {
        setMentionQuery(detected.query);
        setShowDropdown(true);
        mentionAtPosRef.current = detected.atIndex;
      } else {
        setShowDropdown(false);
        setMentionQuery("");
        mentionAtPosRef.current = -1;
      }
    },
    [detectMentionAtCursor]
  );

  // ============================================================
  // 键盘按下（Enter 提交、导航键）
  // ============================================================

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // ---- 下拉菜单导航 ----
      if (showDropdown) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredFiles.length - 1)
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            selectFile(filteredFiles[selectedIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          setMentionQuery("");
          mentionAtPosRef.current = -1;
          return;
        }
      }

      // ---- Enter 提交（Shift+Enter 换行） ----
      if (e.key === "Enter" && !e.shiftKey && !showDropdown) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showDropdown, filteredFiles, selectedIndex, selectFile, handleSubmit]
  );

  // ============================================================
  // 点击 textarea 时重新检测 @
  // ============================================================

  const handleClick = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const detected = detectMentionAtCursor(ta.value, ta.selectionStart);
    if (detected) {
      setMentionQuery(detected.query);
      setShowDropdown(true);
      mentionAtPosRef.current = detected.atIndex;
    } else {
      setShowDropdown(false);
      setMentionQuery("");
      mentionAtPosRef.current = -1;
    }
  }, [detectMentionAtCursor]);

  // ============================================================
  // 解析 value 为 segments（用于高亮渲染）
  // ============================================================

  const parseSegments = useCallback(
    (text: string, allFilesMap: Map<string, string>): Segment[] => {
      const segments: Segment[] = [];
      let lastIndex = 0;

      // 重置 lastIndex
      FILE_MENTION_RE.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = FILE_MENTION_RE.exec(text)) !== null) {
        // 前面的文本
        if (match.index > lastIndex) {
          segments.push({
            kind: "text",
            value: text.slice(lastIndex, match.index),
          });
        }
        // mention
        const filePath = match[1];
        const fileName = allFilesMap.get(filePath) || filePath.split("/").pop() || filePath;
        segments.push({ kind: "mention", filePath, fileName });
        lastIndex = match.index + match[0].length;
      }

      // 剩余文本
      if (lastIndex < text.length) {
        segments.push({ kind: "text", value: text.slice(lastIndex) });
      }

      return segments;
    },
    []
  );

  // ============================================================
  // 构建 path→name 映射
  // ============================================================

  const filesMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const f of allFiles) {
      map.set(f.path, f.name);
    }
    filesMap.current = map;
  }, [allFiles]);

  // ============================================================
  // 高亮渲染的 segments
  // ============================================================

  const segments = parseSegments(value, filesMap.current);

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div ref={containerRef} className="relative flex-1">
      {/* 输入容器（textarea + 高亮覆盖层） */}
      <div className="relative">
        {/* 高亮覆盖层 — 镜像 textarea 内容，给 @file: 加样式 */}
        <div
          className="absolute inset-0 px-4 py-2.5 text-sm whitespace-pre-wrap break-words pointer-events-none overflow-hidden"
          style={{ fontFamily: "inherit", lineHeight: "inherit" }}
          aria-hidden="true"
        >
          {segments.map((seg, i) =>
            seg.kind === "mention" ? (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 px-1 py-px mx-0.5 rounded text-xs font-medium select-none whitespace-nowrap"
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                }}
              >
                <span style={{ fontSize: "10px" }}>📄</span>@{seg.fileName}
              </span>
            ) : (
              <span key={i}>{seg.value}</span>
            )
          )}
          {/* 确保覆盖层高度与 textarea 一致：一个空行撑高 */}
          {value === "" && " "}
        </div>

        {/* textarea — 文字透明，让高亮覆盖层显示出来，但光标仍可见 */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onClick={handleClick}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className={`
            w-full bg-aura-hover border border-aura-border rounded-lg px-4 py-2.5
            text-sm
            transition-colors resize-none
            focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500
            placeholder-aura-text-muted
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
          style={{
            color: "transparent",
            caretColor: "#e5e7eb",
            fontFamily: "inherit",
            lineHeight: "inherit",
          }}
        />
      </div>

      {/* @ 文件下拉菜单 */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute left-0 z-50 w-full max-h-56 overflow-y-auto
                     bg-aura-bg border border-aura-border rounded-lg shadow-xl
                     py-1 bottom-full mb-1"
        >
          <div className="px-3 py-1.5 text-[10px] text-aura-text-muted uppercase tracking-wider border-b border-aura-border">
            📁 工作空间文件
            {mentionQuery && (
              <span className="ml-1 normal-case">
                — 匹配 &quot;{mentionQuery}&quot;
              </span>
            )}
          </div>

          {filteredFiles.length === 0 ? (
            <div className="px-3 py-3 text-xs text-aura-text-muted text-center">
              {allFiles.length === 0
                ? "工作空间中暂无文件"
                : `没有匹配 "${mentionQuery}" 的文件`}
            </div>
          ) : (
            filteredFiles.map((file, i) => (
              <button
                key={file.path}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectFile(file)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`
                  w-full text-left px-3 py-1.5 flex items-center gap-2
                  text-xs transition-colors
                  ${
                    i === selectedIndex
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-aura-text hover:bg-aura-hover"
                  }
                `}
              >
                <span className="flex-shrink-0 text-sm">📄</span>
                <span className="flex-1 truncate font-medium">
                  {highlightMatch(file.name, mentionQuery)}
                </span>
                <span className="text-aura-text-muted text-[10px] truncate max-w-[40%]">
                  {file.path}
                </span>
              </button>
            ))
          )}

          <div className="px-3 py-1 border-t border-aura-border text-[10px] text-aura-text-dim">
            <kbd className="px-1 py-0.5 bg-aura-hover rounded text-[9px]">↑↓</kbd>{" "}
            导航{" "}
            <kbd className="px-1 py-0.5 bg-aura-hover rounded text-[9px]">Enter</kbd>{" "}
            选择{" "}
            <kbd className="px-1 py-0.5 bg-aura-hover rounded text-[9px]">Esc</kbd>{" "}
            关闭
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================
// 辅助
// ============================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark class="bg-emerald-500/30 text-emerald-300 rounded-sm px-0.5">${match}</mark>${after}`;
}
