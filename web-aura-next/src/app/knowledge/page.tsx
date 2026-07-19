/**
 * 知识库页面（规划中）
 *
 * 展示 RAG 语义知识检索的规划状态与实现路径。
 * 底层 agent_knowledge 表 + pgvector 扩展已就绪，上层能力待实现。
 */

const STEPS = [
  {
    num: "01",
    title: "文档自动分块与向量化",
    desc: "监听工作空间文件变更事件，对新增/修改的 .md .txt .json 文件自动按语义段落分块（chunk），调用 embedMany 生成 1536 维向量，写入 agent_knowledge 表。",
    deps: "SDK: embed / embedMany · OpenAI text-embedding-3-small",
    status: "planned",
  },
  {
    num: "02",
    title: "语义检索工具 (search_knowledge_base)",
    desc: "封装 pgvector 的 cosine 相似度搜索为 Agent 可调用的 Tool。Agent 在分析大项目或长日志时，主动调用该工具检索与当前问题最相关的 3-5 个知识片段，突破上下文窗口限制。",
    deps: "pgvector <=> 余弦距离 · 结果重排序",
    status: "planned",
  },
  {
    num: "03",
    title: "记忆自动提取与向量化",
    desc: "在 onFinish 回调中，将 Agent 识别的重要事实（技术栈、项目约定、用户偏好）自动分块向量化写入知识库，使 workspace_memories 具备语义检索能力，替代当前的 Key-Value 精确匹配模式。",
    deps: "与 workspace_memories 表联动",
    status: "planned",
  },
  {
    num: "04",
    title: "知识库管理界面",
    desc: "提供可视化管理能力：按工作空间查看已索引的文档片段、手动触发重新索引、删除过期/错误的知识条目、查看向量存储空间占用统计。",
    deps: "本页面升级为管理后台",
    status: "planned",
  },
];

const DONE_ITEMS = [
  { label: "agent_knowledge 表", detail: "含 vector(1536) 列、category、sourcePath 等字段，按 user_id 隔离" },
  { label: "pgvector 扩展", detail: "PostgreSQL 16 + pgvector 已启用，支持 cosine / l2 / inner product 距离" },
  { label: "Drizzle Schema", detail: "customType 封装 vector(1536)，兼容 Drizzle ORM 查询" },
];

export default function KnowledgePage() {
  return (
    <div className="flex flex-col h-full bg-aura-surface text-aura-text overflow-y-auto">
      {/* ==================== 页面头部 ==================== */}
      <header className="flex-shrink-0 border-b border-aura-border bg-aura-bg">
        <div className="flex items-center px-6 py-4">
          <div>
            <h1 className="text-base font-bold text-aura-text flex items-center gap-2">
              <span className="text-xl">📚</span>
              知识库
            </h1>
            <p className="text-[11px] text-aura-text-dim mt-0.5">
              RAG 语义知识检索 — 基于 pgvector 的向量化知识管理
            </p>
          </div>
          <div className="ml-auto">
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
              📋 规划中
            </span>
          </div>
        </div>
      </header>

      {/* ==================== 页面内容 ==================== */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {/* 概述卡片 */}
        <div className="rounded-xl border border-dashed border-slate-500/30 bg-aura-bg p-5">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🏗️</span>
            <div>
              <h3 className="text-sm font-bold text-aura-text mb-1">
                为什么需要知识库？
              </h3>
              <p className="text-xs text-aura-text-muted leading-relaxed">
                当 Agent 处理大型项目（数百个文件）或长日志（数万行）时，无法将所有内容塞入上下文窗口。
                知识库通过向量相似度搜索，从海量文档中精确召回最相关的片段，让 Agent
                像有了"长期记忆"一样在需要时自动检索关键信息。
              </p>
            </div>
          </div>
        </div>

        {/* 已完成的基础设施 */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-aura-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            已完成的基础设施
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DONE_ITEMS.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
              >
                <p className="text-sm font-semibold text-emerald-400">
                  ✅ {item.label}
                </p>
                <p className="text-xs text-aura-text-muted mt-1 leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 实现路径 */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-aura-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            实现路径（4 步）
          </h2>
          <div className="space-y-3">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className="rounded-xl border border-aura-border bg-aura-bg p-4 hover:border-slate-500/30 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* 步骤编号 */}
                  <span className="text-lg font-bold text-slate-500 flex-shrink-0 mt-0.5 tabular-nums">
                    {step.num}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-aura-text">
                        {step.title}
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20 flex-shrink-0">
                        📋 规划中
                      </span>
                    </div>
                    <p className="text-xs text-aura-text-muted leading-relaxed">
                      {step.desc}
                    </p>
                    {step.deps && (
                      <p className="text-[10px] text-aura-text-dim mt-2 flex items-center gap-1">
                        <span className="text-slate-500">🔗</span>
                        依赖：{step.deps}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 架构示意 */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-aura-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            数据流架构
          </h2>
          <div className="rounded-xl border border-aura-border bg-aura-bg p-5 overflow-x-auto">
            <pre className="text-[11px] text-aura-text-muted leading-relaxed font-mono whitespace-pre">
{`工作空间文件变更
       │
       ▼
┌──────────────────────────────────┐
│  ① 文档分块器 (Chunker)          │
│  · Markdown 按 ## 标题切分       │
│  · 纯文本按段落 + 滑动窗口切分   │
│  · 块大小: 512 tokens, 重叠 64   │
└──────────────┬───────────────────┘
               │ chunks[]
               ▼
┌──────────────────────────────────┐
│  ② 向量化 (embedMany)            │
│  · text-embedding-3-small (1536) │
│  · 批量 20 条/请求，限速 3 QPS   │
└──────────────┬───────────────────┘
               │ vectors[]
               ▼
┌──────────────────────────────────┐
│  ③ 写入 agent_knowledge          │
│  · embedding: vector(1536)       │
│  · sourcePath: 原始文件路径      │
│  · chunkIndex: 片段序号          │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  ④ Agent 调用 search_knowledge   │
│  · 用户提问 → embed → 向量搜索   │
│  · cosine 距离 Top-5 → 注入 prompt│
│  · 附带 sourcePath 供 Agent 溯源  │
└──────────────────────────────────┘`}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
