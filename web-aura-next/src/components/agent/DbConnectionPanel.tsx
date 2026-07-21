"use client";

/**
 * 数据库连接管理面板
 *
 * 弹窗形式，支持数据库连接的增删改查 + 测试连接。
 * 表单字段：label, dbType, host, port, dbName, username, password, sslMode
 * 密码不自动回填已加密值。
 */
import React, { useState, useEffect, useCallback } from "react";
import { auraFetch } from "@/lib/api-client";
import type { DbConnectionItem } from "@/lib/agent/scene-data";

interface DbConnectionPanelProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void; // 配置变更后通知父组件刷新
}

export function DbConnectionPanel({
  open,
  onClose,
  onChanged,
}: DbConnectionPanelProps) {
  const [connections, setConnections] = useState<DbConnectionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 编辑模式
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    dbType: "postgresql",
    host: "",
    port: 5432,
    dbName: "",
    username: "",
    password: "",
    sslMode: "prefer",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 测试连接状态
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // 加载连接列表
  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auraFetch("/api/db-connections");
      const data = await res.json();
      if (data.code === 200 && data.data?.connections) {
        setConnections(data.data.connections);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadConnections();
      resetForm();
      setError("");
      setTestResult(null);
    }
  }, [open, loadConnections]);

  const resetForm = () => {
    setForm({
      label: "",
      dbType: "postgresql",
      host: "",
      port: 5432,
      dbName: "",
      username: "",
      password: "",
      sslMode: "prefer",
    });
    setEditingId(null);
    setError("");
  };

  // 开始编辑
  const startEdit = (conn: DbConnectionItem) => {
    setEditingId(conn.id);
    setForm({
      label: conn.label,
      dbType: conn.dbType,
      host: conn.host,
      port: conn.port,
      dbName: conn.dbName,
      username: conn.username,
      password: "", // 不回填密码
      sslMode: conn.sslMode ?? "prefer",
    });
    setError("");
    setTestResult(null);
  };

  // 保存（新增或更新）
  const handleSave = async () => {
    if (!form.label.trim() || !form.host.trim() || !form.dbName.trim() || !form.username.trim()) {
      setError("标签、主机、数据库名、用户名为必填项");
      return;
    }
    if (editingId === null && !form.password.trim()) {
      setError("密码为必填项");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const body = {
        label: form.label.trim(),
        dbType: form.dbType,
        host: form.host.trim(),
        port: form.port,
        dbName: form.dbName.trim(),
        username: form.username.trim(),
        password: form.password.trim(),
        sslMode: form.sslMode,
      };

      let res: Response;
      if (editingId) {
        res = await auraFetch(`/api/db-connections/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await auraFetch("/api/db-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();
      if (data.code === 200 || data.code === 201) {
        resetForm();
        await loadConnections();
        onChanged();
      } else {
        setError(data.message ?? "操作失败");
      }
    } catch {
      setError("网络请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 删除
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此数据库连接吗？")) return;
    try {
      const res = await auraFetch(`/api/db-connections/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.code === 200) {
        await loadConnections();
        onChanged();
      }
    } catch {
      // ignore
    }
  };

  // 测试连接
  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await auraFetch(`/api/db-connections/${id}/test`, {
        method: "POST",
      });
      const data = await res.json();
      setTestResult({
        success: data.data?.success ?? false,
        message: data.data?.message ?? data.message ?? "测试完成",
      });
      await loadConnections();
      onChanged();
    } catch {
      setTestResult({ success: false, message: "网络请求失败" });
    } finally {
      setTestingId(null);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
        onClick={onClose}
      >
        {/* 模态框 */}
        <div
          className="bg-aura-surface border border-aura-border rounded-xl shadow-2xl w-[640px] max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-aura-border">
            <h2 className="text-lg font-semibold text-aura-text">
              管理数据库连接
            </h2>
            <button
              onClick={onClose}
              className="text-aura-text-muted hover:text-aura-text transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)] space-y-6">
            {/* 连接列表 */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-aura-border border-t-emerald-400" />
                <span className="ml-3 text-aura-text-muted text-sm">加载中...</span>
              </div>
            ) : connections.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-aura-text-muted uppercase tracking-wider">
                  已有连接
                </h3>
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-aura-hover border border-aura-border"
                  >
                    {/* 状态指示器 */}
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        conn.testResult === "success"
                          ? "bg-emerald-400"
                          : conn.testResult === "failed"
                            ? "bg-red-400"
                            : "bg-aura-text-dim"
                      }`}
                      title={
                        conn.lastTestedAt
                          ? `最后测试: ${new Date(conn.lastTestedAt).toLocaleString("zh-CN")}`
                          : "未测试"
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-aura-text truncate">
                          {conn.label}
                        </span>
                        <span className="text-[10px] text-aura-text-dim bg-aura-border rounded px-1.5 py-0.5 flex-shrink-0">
                          {conn.dbType}
                        </span>
                      </div>
                      <span className="text-xs text-aura-text-muted truncate block">
                        {conn.host}:{conn.port}/{conn.dbName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTest(conn.id)}
                        disabled={testingId === conn.id}
                        className="text-xs px-2 py-1 rounded text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {testingId === conn.id ? (
                          <>
                            <div className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
                            测试中
                          </>
                        ) : (
                          "测试"
                        )}
                      </button>
                      <button
                        onClick={() => startEdit(conn)}
                        className="text-xs px-2 py-1 rounded text-aura-text-secondary hover:text-aura-text hover:bg-aura-border transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(conn.id)}
                        className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-aura-text-muted text-sm">
                暂无数据库连接，请在下方创建
              </div>
            )}

            {/* 测试结果 */}
            {testResult && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  testResult.success
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}
              >
                {testResult.message}
              </div>
            )}

            {/* 分隔线 */}
            <div className="border-t border-aura-border" />

            {/* 新增/编辑表单 */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-aura-text-muted uppercase tracking-wider">
                {editingId ? "编辑连接" : "新建连接"}
              </h3>

              {/* 标签 */}
              <div>
                <label className="block text-xs text-aura-text-muted mb-1">标签</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="如 生产-PostgreSQL-只读"
                  className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text placeholder:text-aura-text-dim focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* 数据库类型 */}
              <div>
                <label className="block text-xs text-aura-text-muted mb-1">类型</label>
                <select
                  value={form.dbType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dbType: e.target.value,
                      port: e.target.value === "mysql" ? 3306 : 5432,
                    })
                  }
                  className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                </select>
              </div>

              {/* 主机 + 端口 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-aura-text-muted mb-1">主机</label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    placeholder="localhost"
                    className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text placeholder:text-aura-text-dim focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-aura-text-muted mb-1">端口</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>

              {/* 数据库名 */}
              <div>
                <label className="block text-xs text-aura-text-muted mb-1">数据库名</label>
                <input
                  type="text"
                  value={form.dbName}
                  onChange={(e) => setForm({ ...form, dbName: e.target.value })}
                  placeholder="mydb"
                  className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text placeholder:text-aura-text-dim focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* 用户名 */}
              <div>
                <label className="block text-xs text-aura-text-muted mb-1">用户名</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="readonly_user"
                  className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text placeholder:text-aura-text-dim focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* 密码 */}
              <div>
                <label className="block text-xs text-aura-text-muted mb-1">
                  密码{editingId ? "（留空则保留原密码）" : ""}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingId ? "留空保留原密码" : "输入数据库密码"}
                  className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text placeholder:text-aura-text-dim focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* SSL 模式 */}
              <div>
                <label className="block text-xs text-aura-text-muted mb-1">SSL 模式</label>
                <select
                  value={form.sslMode}
                  onChange={(e) => setForm({ ...form, sslMode: e.target.value })}
                  className="w-full px-3 py-2 bg-aura-bg border border-aura-border rounded-lg text-sm text-aura-text focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="prefer">prefer（优先 SSL）</option>
                  <option value="require">require（强制 SSL）</option>
                  <option value="disable">disable（禁用 SSL）</option>
                </select>
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">
                  {error}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting
                    ? "保存中..."
                    : editingId
                      ? "更新连接"
                      : "创建连接"}
                </button>
                {editingId && (
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 text-sm text-aura-text-muted hover:text-aura-text border border-aura-border rounded-lg transition-colors"
                  >
                    取消编辑
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
