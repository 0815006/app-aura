"use client";

/**
 * 模型配置管理面板
 *
 * 弹窗形式，支持模型的增删改查。
 * - 表单字段：label, modelName, apiKey, baseUrl, isDefault
 * - 列表展示已有配置，支持编辑/删除
 * - apiKey 不自动回填已加密值
 */
import React, { useState, useEffect, useCallback } from "react";

// ============================================================
// 类型
// ============================================================

interface ModelConfigSafe {
  id: string;
  label: string;
  modelName: string;
  baseUrl: string | null;
  isDefault: boolean | null;
}

interface ModelConfigPanelProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void; // 配置变更后通知父组件刷新
}

// ============================================================
// 组件
// ============================================================

export function ModelConfigPanel({
  open,
  onClose,
  onChanged,
}: ModelConfigPanelProps) {
  const [configs, setConfigs] = useState<ModelConfigSafe[]>([]);
  const [loading, setLoading] = useState(false);

  // 编辑模式
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    modelName: "",
    apiKey: "",
    baseUrl: "",
    isDefault: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 加载配置列表
  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      if (data.code === 200 && Array.isArray(data.data)) {
        setConfigs(data.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadConfigs();
      setEditingId(null);
      resetForm();
      setError("");
    }
  }, [open, loadConfigs]);

  const resetForm = () => {
    setForm({ label: "", modelName: "", apiKey: "", baseUrl: "", isDefault: false });
  };

  // 开始编辑
  const handleEdit = (cfg: ModelConfigSafe) => {
    setEditingId(cfg.id);
    setForm({
      label: cfg.label,
      modelName: cfg.modelName,
      apiKey: "", // 不回填已加密的 Key
      baseUrl: cfg.baseUrl || "",
      isDefault: cfg.isDefault ?? false,
    });
    setError("");
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingId(null);
    resetForm();
    setError("");
  };

  // 提交（新增或更新）
  const handleSubmit = async () => {
    if (!form.label.trim() || !form.modelName.trim()) {
      setError("标签和模型名不能为空");
      return;
    }
    if (!editingId && !form.apiKey.trim()) {
      setError("API Key 不能为空");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      let res: Response;
      if (editingId) {
        // 更新
        const body: Record<string, unknown> = {
          label: form.label.trim(),
          modelName: form.modelName.trim(),
          isDefault: form.isDefault,
        };
        if (form.baseUrl.trim()) {
          body.baseUrl = form.baseUrl.trim();
        }
        if (form.apiKey.trim()) {
          body.apiKey = form.apiKey.trim();
        }
        res = await fetch(`/api/models?id=${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        // 新增
        res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: form.label.trim(),
            modelName: form.modelName.trim(),
            apiKey: form.apiKey.trim(),
            baseUrl: form.baseUrl.trim() || undefined,
            isDefault: form.isDefault,
          }),
        });
      }

      const data = await res.json();
      if (data.code === 200) {
        await loadConfigs();
        onChanged();
        handleCancelEdit();
      } else {
        setError(data.message || "操作失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  // 删除
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个模型配置吗？")) return;

    try {
      const res = await fetch(`/api/models?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.code === 200) {
        await loadConfigs();
        onChanged();
      } else {
        setError(data.message || "删除失败");
      }
    } catch {
      setError("网络错误");
    }
  };

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* 面板 */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-aura-surface border-l border-aura-border shadow-2xl flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-aura-border">
          <h2 className="text-lg font-bold text-aura-text">
            {editingId ? "编辑模型配置" : "模型配置管理"}
          </h2>
          <button
            onClick={onClose}
            className="text-aura-text-secondary hover:text-aura-text transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 错误信息 */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* 新增/编辑表单 */}
          {editingId !== null || configs.length === 0 ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-aura-text">
                {editingId ? "编辑配置" : "新增模型配置"}
              </h3>

              <div>
                <label className="block text-xs text-aura-text-secondary mb-1">标签 *</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="例如: 生产环境 DeepSeek"
                  className="w-full bg-aura-hover border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-text-muted focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-aura-text-secondary mb-1">模型名 *</label>
                <input
                  type="text"
                  value={form.modelName}
                  onChange={(e) => setForm({ ...form, modelName: e.target.value })}
                  placeholder="例如: deepseek-chat"
                  className="w-full bg-aura-hover border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-text-muted focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-aura-text-secondary mb-1">
                  API Key {!editingId && "*"} {editingId ? "(留空则不修改)" : ""}
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-aura-hover border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-text-muted focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-aura-text-secondary mb-1">Base URL</label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full bg-aura-hover border border-aura-border rounded-lg px-3 py-2 text-sm text-aura-text placeholder-aura-text-muted focus:outline-none focus:border-emerald-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="rounded border-aura-border bg-aura-hover text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-aura-text-secondary">设为默认模型</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-aura-hover disabled:text-aura-text-muted text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {submitting ? "提交中..." : editingId ? "保存修改" : "新增"}
                </button>
                {editingId && (
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 text-sm text-aura-text-secondary hover:text-aura-text bg-aura-hover hover:bg-aura-border rounded-lg transition-colors"
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingId("__new__")}
              className="w-full py-3 border-2 border-dashed border-aura-border rounded-lg text-sm text-aura-text-muted hover:text-emerald-400 hover:border-emerald-600 transition-colors"
            >
              + 新增模型配置
            </button>
          )}

          {/* 配置列表 */}
          {loading ? (
            <div className="text-sm text-aura-text-muted text-center py-4">加载中...</div>
          ) : configs.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-aura-text">
                已有配置 ({configs.length})
              </h3>
              {configs.map((cfg) => (
                <div
                  key={cfg.id}
                  className="flex items-center justify-between p-3 bg-aura-hover rounded-lg border border-aura-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-aura-text truncate">
                        {cfg.label}
                      </span>
                      {cfg.isDefault && (
                        <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                          默认
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-aura-text-muted block mt-0.5">
                      {cfg.modelName}
                      {cfg.baseUrl && (
                        <span className="ml-2 text-aura-text-dim">{cfg.baseUrl}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => {
                        handleEdit(cfg);
                      }}
                      className="text-xs text-aura-text-secondary hover:text-emerald-400 px-2 py-1 rounded hover:bg-aura-border transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(cfg.id)}
                      className="text-xs text-aura-text-secondary hover:text-red-400 px-2 py-1 rounded hover:bg-aura-border transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {!editingId && (
                <button
                  onClick={() => setEditingId("__new__")}
                  className="w-full py-2 border border-dashed border-aura-border rounded-lg text-xs text-aura-text-muted hover:text-emerald-400 hover:border-emerald-600 transition-colors"
                >
                  + 新增
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
