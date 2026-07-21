"use client";

/**
 * 系统设置页面
 *
 * 四个配置模块：AI 模型、数据库连接、联网搜索、默认配额。
 */
import { useState, useEffect, useCallback } from "react";
import { auraFetch } from "@/lib/api-client";
import { ModelConfigPanel } from "@/components/agent/ModelConfigPanel";
import { DbConnectionPanel } from "@/components/agent/DbConnectionPanel";
import { SettingsCard } from "@/components/settings/SettingsCard";

interface SettingsData {
  [key: string]: { value: string; isCustom: boolean };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [settingsLoading, setSettingsLoading] = useState(true);

  // 模型配置
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [modelCount, setModelCount] = useState(0);
  const [defaultModel, setDefaultModel] = useState("");

  // DB 连接
  const [dbPanelOpen, setDbPanelOpen] = useState(false);
  const [dbConnCount, setDbConnCount] = useState(0);

  // 联网搜索编辑态
  const [editingSearchKey, setEditingSearchKey] = useState(false);
  const [searchKeyInput, setSearchKeyInput] = useState("");
  const [searchKeySaving, setSearchKeySaving] = useState(false);

  // 配额编辑态
  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaInput, setQuotaInput] = useState("");
  const [quotaSaving, setQuotaSaving] = useState(false);

  // 消息
  const [searchKeyMsg, setSearchKeyMsg] = useState("");
  const [quotaMsg, setQuotaMsg] = useState("");

  // ========== 加载用户设置 ==========
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await auraFetch("/api/user-settings");
      const data = await res.json();
      if (data.code === 200) {
        setSettings(data.data.settings);
      }
    } catch {
      // ignore
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  // ========== 加载模型概览 ==========
  const loadModels = useCallback(async () => {
    try {
      const res = await auraFetch("/api/models");
      const data = await res.json();
      if (data.code === 200 && Array.isArray(data.data)) {
        setModelCount(data.data.length);
        const def = data.data.find((m: { isDefault?: boolean }) => m.isDefault);
        setDefaultModel(def?.modelName ?? (data.data[0]?.modelName ?? ""));
      }
    } catch {
      // ignore
    }
  }, []);

  // ========== 加载 DB 连接概览 ==========
  const loadDbConns = useCallback(async () => {
    try {
      const res = await auraFetch("/api/db-connections");
      const data = await res.json();
      if (data.code === 200 && Array.isArray(data.data?.connections)) {
        setDbConnCount(data.data.connections.length);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadModels();
    loadDbConns();
  }, [loadSettings, loadModels, loadDbConns]);

  // ========== 保存单项设置 ==========
  const saveSetting = async (key: string, value: string | null) => {
    const res = await auraFetch("/api/user-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const data = await res.json();
    if (data.code === 200) {
      await loadSettings();
      return true;
    }
    return false;
  };

  // ========== 联网搜索 Key ==========
  const handleEditSearchKey = () => {
    setSearchKeyInput(settings.bing_search_api_key?.value ?? "");
    setSearchKeyMsg("");
    setEditingSearchKey(true);
  };
  const handleSaveSearchKey = async () => {
    setSearchKeySaving(true);
    const val = searchKeyInput.trim();
    const ok = await saveSetting("bing_search_api_key", val || null);
    setSearchKeyMsg(ok ? "已保存" : "保存失败");
    if (ok) setEditingSearchKey(false);
    setSearchKeySaving(false);
    setTimeout(() => setSearchKeyMsg(""), 2000);
  };
  const handleResetSearchKey = async () => {
    setSearchKeySaving(true);
    const ok = await saveSetting("bing_search_api_key", null);
    setSearchKeyMsg(ok ? "已恢复默认" : "操作失败");
    if (ok) {
      setEditingSearchKey(false);
      setSearchKeyInput("");
    }
    setSearchKeySaving(false);
    setTimeout(() => setSearchKeyMsg(""), 2000);
  };

  // ========== 默认配额 ==========
  const handleEditQuota = () => {
    setQuotaInput(settings.daily_token_limit?.value ?? "500000");
    setQuotaMsg("");
    setEditingQuota(true);
  };
  const handleSaveQuota = async () => {
    setQuotaSaving(true);
    const ok = await saveSetting("daily_token_limit", quotaInput);
    setQuotaMsg(ok ? "已保存" : "保存失败");
    if (ok) setEditingQuota(false);
    setQuotaSaving(false);
    setTimeout(() => setQuotaMsg(""), 2000);
  };
  const handleResetQuota = async () => {
    setQuotaSaving(true);
    const ok = await saveSetting("daily_token_limit", null);
    setQuotaMsg(ok ? "已恢复默认" : "操作失败");
    if (ok) {
      setEditingQuota(false);
      setQuotaInput("");
    }
    setQuotaSaving(false);
    setTimeout(() => setQuotaMsg(""), 2000);
  };

  // ========== 搜索 Key 脱敏显示 ==========
  const maskKey = (key: string) => {
    if (!key || key.length < 12) return key ? "已设置" : "未设置（使用系统默认）";
    return key.slice(0, 8) + "..." + key.slice(-4);
  };

  const searchKeyValue = settings.bing_search_api_key?.value ?? "";
  const searchKeyCustom = settings.bing_search_api_key?.isCustom ?? false;
  const quotaValue = settings.daily_token_limit?.value ?? "500000";
  const quotaCustom = settings.daily_token_limit?.isCustom ?? false;

  return (
    <div className="flex flex-col h-full bg-aura-surface text-aura-text overflow-y-auto">
      {/* ====== 头部 ====== */}
      <header className="flex-shrink-0 border-b border-aura-border bg-aura-bg">
        <div className="flex items-center px-6 py-4">
          <div>
            <h1 className="text-base font-bold text-aura-text flex items-center gap-2">
              <span className="text-xl">⚙️</span>
              系统设置
            </h1>
            <p className="text-[11px] text-aura-text-dim mt-0.5">
              管理你的 AI 模型、数据库连接、联网搜索和配额偏好
            </p>
          </div>
        </div>
      </header>

      {/* ====== 内容 ====== */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl space-y-4">
        {settingsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-aura-border border-t-emerald-400" />
          </div>
        ) : (
          <>
            {/* 1. AI 模型 */}
            <SettingsCard
              icon="🤖"
              title="AI 模型"
              description="管理你的 AI 模型配置，支持 DeepSeek、OpenAI 等厂商。"
              footer={
                <button
                  onClick={() => setModelPanelOpen(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                >
                  管理模型配置 →
                </button>
              }
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-aura-text-muted">当前默认</span>
                <span className="text-aura-text font-medium">
                  {defaultModel || "未配置"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-aura-text-muted">已配置</span>
                <span className="text-aura-text">{modelCount} 个模型</span>
              </div>
            </SettingsCard>

            {/* 2. 数据库连接 */}
            <SettingsCard
              icon="🔗"
              title="数据库连接"
              description="管理 PostgreSQL / MySQL 数据库连接配置，用于数据库诊断专家场景。"
              footer={
                <button
                  onClick={() => setDbPanelOpen(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                >
                  管理数据库连接 →
                </button>
              }
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-aura-text-muted">已保存</span>
                <span className="text-aura-text">{dbConnCount} 个连接</span>
              </div>
            </SettingsCard>

            {/* 3. 联网搜索 */}
            <SettingsCard
              icon="🌐"
              title="联网搜索"
              description="配置 Bing Search API Key，让 AI 能够实时搜索互联网获取最新信息。"
              badge={searchKeyCustom ? { text: "自定义", color: "amber" } : undefined}
            >
              {editingSearchKey ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={searchKeyInput}
                      onChange={(e) => setSearchKeyInput(e.target.value)}
                      placeholder="填入 Bing Search API Key"
                      className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text font-mono focus:outline-none focus:border-emerald-500/50"
                    />
                    <button
                      onClick={handleSaveSearchKey}
                      disabled={searchKeySaving}
                      className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                    >
                      {searchKeySaving ? "..." : "确定"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleResetSearchKey}
                      disabled={searchKeySaving}
                      className="text-[10px] text-aura-text-muted hover:text-amber-400 transition-colors"
                    >
                      恢复系统默认
                    </button>
                    <button
                      onClick={() => setEditingSearchKey(false)}
                      className="text-[10px] text-aura-text-muted hover:text-aura-text transition-colors"
                    >
                      取消
                    </button>
                  </div>
                  {searchKeyMsg && (
                    <p className={`text-[10px] ${
                      searchKeyMsg === "已保存" || searchKeyMsg === "已恢复默认"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}>
                      {searchKeyMsg}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-aura-text font-mono">
                      {maskKey(searchKeyValue)}
                    </p>
                    <p className="text-[10px] text-aura-text-dim mt-0.5">
                      {searchKeyCustom ? "用户自定义 Key" : "使用系统全局 Key"}
                    </p>
                  </div>
                  <button
                    onClick={handleEditSearchKey}
                    className="text-xs text-aura-text-muted hover:text-emerald-400 transition-colors"
                  >
                    {searchKeyCustom ? "修改" : "自定义"}
                  </button>
                </div>
              )}
              <p className="text-[10px] text-aura-text-dim mt-2">
                前往{" "}
                <a
                  href="https://portal.azure.com/#create/Microsoft.BingSearch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  Azure Portal
                </a>{" "}
                创建 Bing Search 资源获取 Key
              </p>
            </SettingsCard>

            {/* 4. 默认配额 */}
            <SettingsCard
              icon="📊"
              title="默认配额"
              description="新建工作空间时的初始每日 Token 配额。后续可按工作空间单独调整。"
              badge={quotaCustom ? { text: "自定义", color: "amber" } : undefined}
            >
              {editingQuota ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={quotaInput}
                      onChange={(e) => setQuotaInput(e.target.value)}
                      className="flex-1 bg-aura-bg border border-aura-border rounded-lg px-2.5 py-1.5 text-xs text-aura-text focus:outline-none focus:border-emerald-500/50"
                      min={10000}
                      max={5000000}
                      step={100000}
                    />
                    <span className="text-xs text-aura-text-muted">token/天</span>
                    <button
                      onClick={handleSaveQuota}
                      disabled={quotaSaving}
                      className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                    >
                      {quotaSaving ? "..." : "确定"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleResetQuota}
                      disabled={quotaSaving}
                      className="text-[10px] text-aura-text-muted hover:text-amber-400 transition-colors"
                    >
                      恢复系统默认
                    </button>
                    <button
                      onClick={() => setEditingQuota(false)}
                      className="text-[10px] text-aura-text-muted hover:text-aura-text transition-colors"
                    >
                      取消
                    </button>
                  </div>
                  {quotaMsg && (
                    <p className={`text-[10px] ${
                      quotaMsg === "已保存" || quotaMsg === "已恢复默认"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}>
                      {quotaMsg}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-aura-text font-medium">
                      {parseInt(quotaValue, 10).toLocaleString()} token/天
                    </p>
                    <p className="text-[10px] text-aura-text-dim mt-0.5">
                      范围 10,000 ~ 5,000,000
                    </p>
                  </div>
                  <button
                    onClick={handleEditQuota}
                    className="text-xs text-aura-text-muted hover:text-emerald-400 transition-colors"
                  >
                    {quotaCustom ? "修改" : "自定义"}
                  </button>
                </div>
              )}
            </SettingsCard>
          </>
        )}
      </div>

      {/* 模态框 */}
      <ModelConfigPanel
        open={modelPanelOpen}
        onClose={() => {
          setModelPanelOpen(false);
          loadModels();
        }}
        onChanged={loadModels}
      />
      <DbConnectionPanel
        open={dbPanelOpen}
        onClose={() => {
          setDbPanelOpen(false);
          loadDbConns();
        }}
        onChanged={() => {
          loadDbConns();
          window.dispatchEvent(new CustomEvent("db-connections-changed"));
        }}
      />
    </div>
  );
}
