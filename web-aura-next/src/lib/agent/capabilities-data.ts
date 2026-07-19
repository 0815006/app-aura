/**
 * Aura 智能体能力静态数据
 *
 * 来源：[智能体能力PRD.md](../../../docs/智能体能力PRD.md)
 * 能力按四个层次组织，共计 16 项。
 */

export interface CapabilityItem {
  id: string;
  name: string;
  description: string;
  details: string;
  layer: 1 | 2 | 3 | 4;
  layerName: string;
  sdkFeature?: string;
  status: "done" | "wip" | "planned";
  icon: string;
}

export interface CapabilityLayer {
  level: number;
  name: string;
  subtitle: string;
  color: string; // Tailwind color family
}

export const CAPABILITY_LAYERS: CapabilityLayer[] = [
  {
    level: 1,
    name: "SDK 底层能力",
    subtitle: "Vercel AI SDK 原生提供的基础原材料",
    color: "blue",
  },
  {
    level: 2,
    name: "通用基础能力",
    subtitle: "组合 SDK 能力构建的通用骨架",
    color: "emerald",
  },
  {
    level: 3,
    name: "高阶增强能力",
    subtitle: "榨干 SDK 潜力的进阶玩法",
    color: "amber",
  },
  {
    level: 4,
    name: "外部配套能力",
    subtitle: "SDK 不提供、由后台自建补齐",
    color: "purple",
  },
];

export const CAPABILITIES: CapabilityItem[] = [
  // ============================================================
  // L1: SDK 底层能力 (5 项)
  // ============================================================
  {
    id: "multi-model",
    name: "多模型统一抽象",
    description: "同一套代码无缝切换 GPT-4o、Claude、Gemini 等不同厂商模型",
    details:
      "SDK 提供统一的模型抽象层（Providers）。可在后台根据任务类型动态切换（如写代码用 Claude，算数据用 GPT-4o），无需改动底层工具和执行逻辑。当前 Aura 通过 DeepSeek API 接入，支持配置多组模型密钥随时切换。",
    layer: 1,
    layerName: "SDK 底层能力",
    sdkFeature: "streamText / generateText",
    status: "done",
    icon: "🔀",
  },
  {
    id: "streaming",
    name: "高并发流式传输",
    description: "支持文本、JSON 对象及自定义事件的实时流式推送",
    details:
      "从后端到前端，数据以 SSE（Server-Sent Events）流的形式逐步到达。用户无需等待完整响应即可看到逐字输出，体验类似 ChatGPT 的打字效果。",
    layer: 1,
    layerName: "SDK 底层能力",
    sdkFeature: "streamText",
    status: "done",
    icon: "🌊",
  },
  {
    id: "structured-output",
    name: "结构化数据强制输出",
    description: "强制大模型 100% 按定义 Schema 返回数据，不错不漏",
    details:
      "通过 Zod Schema 定义输出格式，SDK 保证模型返回严格符合结构的数据。适用于需要机器可读输出的场景（如生成 JSON 配置、提取结构化信息）。",
    layer: 1,
    layerName: "SDK 底层能力",
    sdkFeature: "Structured Outputs",
    status: "done",
    icon: "📐",
  },
  {
    id: "multi-step-loop",
    name: "多步工具调用闭环",
    description: "大模型自主决定连续多次调用不同工具，直到任务完成",
    details:
      "开启 maxSteps 后，SDK 自动接管「思考 → 调工具 → 拿到结果 → 再思考 → 再调工具」的闭环（ReAct 模式）。类似 Roo Code/Claude Code 的自主调试流程——Agent 改代码、跑测试、看报错、再修改，循环直至问题解决。",
    layer: 1,
    layerName: "SDK 底层能力",
    sdkFeature: "maxSteps (多步循环)",
    status: "done",
    icon: "🔄",
  },
  {
    id: "telemetry",
    name: "原生遥测",
    description: "基于 OpenTelemetry 精确记录每次调用的 Token 消耗、延迟和错误",
    details:
      "SDK 原生支持 OpenTelemetry 标准，可接入可观测性平台（如 Jaeger、Grafana）进行全链路监控。Aura 当前利用 onFinish 回调将 Token 用量和步骤时间线存入 workspace_runs 表。",
    layer: 1,
    layerName: "SDK 底层能力",
    sdkFeature: "Telemetry & Instrumentation",
    status: "done",
    icon: "📊",
  },

  // ============================================================
  // L2: 通用基础能力 (4 项)
  // ============================================================
  {
    id: "file-rw",
    name: "跨文件读写与命令执行",
    description: "封装文件读写、目录扫描、Shell 执行为 Tools 喂给大模型",
    details:
      "这是智能体的「手和脚」。通过 SDK 的 tool() 函数将本地文件操作封装成标准化工具，Agent 可自主操控工作空间内的所有文件和目录——读取代码、创建目录、写入文件、执行 Python 脚本。",
    layer: 2,
    layerName: "通用基础能力",
    sdkFeature: "tools (工具定义)",
    status: "done",
    icon: "📁",
  },
  {
    id: "auto-planning",
    name: "自主规划与连续排查",
    description: "Agent 自主执行「改代码 → 跑测试 → 发现报错 → 再改代码」的调试循环",
    details:
      "利用 SDK 的 maxSteps 多步循环机制，Agent 在后台自我纠错、连续调用工具——像资深工程师一样排查问题。当前 Aura 限制单次最多 15 步，防止失控。",
    layer: 2,
    layerName: "通用基础能力",
    sdkFeature: "maxSteps (多步循环限制)",
    status: "done",
    icon: "🧠",
  },
  {
    id: "step-visualization",
    name: "步骤与思考过程展示",
    description: "将 Agent 的思考过程（CoT）和工具执行结果实时流式传输给前端",
    details:
      "利用 SDK 的步骤捕获能力（onChunk & steps），前端通过 StepAccordion 组件展示 AI 的思考链和每一步工具调用的参数与结果，彻底消除黑盒感——用户能看到 Agent「脑子里在想什么」。",
    layer: 2,
    layerName: "通用基础能力",
    sdkFeature: "onChunk & steps 数据捕获",
    status: "done",
    icon: "👁️",
  },
  {
    id: "token-audit",
    name: "用量与 Token 精确审计",
    description: "onFinish 回调提供精确 Token 计数器，记录单次任务消耗",
    details:
      "在 streamText 的 onFinish 中获取 promptTokens / completionTokens / totalTokens，持久化到 workspace_runs 表。前端通过 UsageBadge 组件实时显示，帮助用户掌控成本。",
    layer: 2,
    layerName: "通用基础能力",
    sdkFeature: "onFinish (生命周期回调)",
    status: "done",
    icon: "🪙",
  },
  {
    id: "scene-driven-agent",
    name: "场景驱动型智能体",
    description: "通过 System Prompt + 工具组合动态切换 Agent 专家角色，一平台多用",
    details:
      "已上线 7 个专家场景：数据库慢 SQL 诊断（配 4 个 DB 专属工具）、系统性能分析、需求分析与架构拆解、功能点估算、测试分析（银行级用例生成 + 造数规则导出）、UI 原型契约与自动化校验（Playwright 无头浏览器 DOM 抓取 + 语义比对审计）等。选择场景后自动注入角色 Prompt + 挂载专属工具，切换场景即切换 AI 能力。纯文件驱动场景无需新工具，换个 Prompt 即上线。场景间支持上下游联动——测试分析专家可直接消费功能点估算专家的 JSON 产出。",
    layer: 2,
    layerName: "通用基础能力",
    sdkFeature: "tools + System Prompt 动态注入",
    status: "done",
    icon: "🎭",
  },

  // ============================================================
  // L3: 高阶增强能力 (5 项)
  // ============================================================
  {
    id: "semantic-search",
    name: "语义知识检索 (RAG)",
    description: "基于 pgvector 向量相似度搜索，从工作空间知识库中精确召回相关上下文",
    details:
      "agent_knowledge 表已建（含 vector(1536) 嵌入列），pgvector 扩展已启用。待实现：(1) 文件变更自动分块 + embedMany 生成向量写入；(2) search_knowledge_base 工具供 Agent 在工作空间中做语义检索。目标：大项目/长日志超越 Context 限制时，精确召回最相关的 3-5 块内容。",
    layer: 3,
    layerName: "高阶增强能力",
    sdkFeature: "embed / embedMany",
    status: "planned",
    icon: "🔍",
  },
  {
    id: "progressive-preview",
    name: "渐进式实时预览",
    description: "利用 streamObject 实现配置文件的「边生成边渲染」",
    details:
      "当 Agent 生成复杂配置文件（如 CI/CD 流程、K8s 部署文件、SQL 语句包）时，前端不等完整输出就能感知并渲染局部可视化界面。用户体验从「等待黑盒出结果」变成「看着配置一点点被 AI 构造出来」。",
    layer: 3,
    layerName: "高阶增强能力",
    sdkFeature: "streamObject",
    status: "planned",
    icon: "🎬",
  },
  {
    id: "human-in-the-loop",
    name: "交互式人机协同",
    description: "高危操作自动暂停，弹出确认框，用户允许后继续执行",
    details:
      "当 Agent 触发 rm -rf、npm install、drop table 等危险操作时，SDK 暂停执行，向前端发送审批挂起信号。用户在界面点击「允许」后 SDK 继续执行。安全性与自主性兼得。",
    layer: 3,
    layerName: "高阶增强能力",
    sdkFeature: "工具调用拦截 / 审批挂起",
    status: "planned",
    icon: "🛡️",
  },
  {
    id: "tool-routing",
    name: "动态工具剪裁",
    description: "按场景自动精简可用工具集，防止工具过载（Tool Bloat）影响模型决策准确率",
    details:
      "场景定义表中 tool_whitelist 字段已就绪。当前已实现按场景动态挂载专属工具（如 DB 场景自动加载 4 个数据库工具），但白名单运行时过滤未启用。启用后：选择需求分析场景 → 自动移除 DB 工具，仅保留文件读写 + 需求分析相关工具，减少 Token 浪费和工具选择错误率。",
    layer: 3,
    layerName: "高阶增强能力",
    sdkFeature: "tools 动态合并",
    status: "planned",
    icon: "✂️",
  },
  {
    id: "multimodal-debug",
    name: "多模态视觉调试",
    description: "Agent 自主截图并通过视觉能力对比排查 UI 问题",
    details:
      "Agent 运行代码后通过 capture_screen 工具截图，再通过 SDK 多模态能力把图片喂给自己——用「眼睛」检查渲染结果、排版错乱、图表未渲染等非代码逻辑问题。实现视觉级别的自动除错。",
    layer: 3,
    layerName: "高阶增强能力",
    sdkFeature: "Vision（多模态输入）",
    status: "planned",
    icon: "👀",
  },

  // ============================================================
  // L4: 外部配套能力 (5 项)
  // ============================================================
  {
    id: "sandbox",
    name: "物理安全沙箱",
    description: "工具执行限制在工作空间目录内，路径守卫防止越权访问",
    details:
      "所有文件读写和命令执行工具在执行前通过 resolveWorkspaceAwarePath 校验目标路径，确保不超出当前工作空间根路径。越权操作直接抛出异常并记录日志。长远方案为每个工作空间分配 Docker 容器实现物理级别隔离。",
    layer: 4,
    layerName: "外部配套能力",
    status: "done",
    icon: "🔒",
  },
  {
    id: "state-persistence",
    name: "状态与历史持久化",
    description: "每次交互的思考步骤、工具调用、Token 用量存入 PostgreSQL 数据库",
    details:
      "workspace_runs + run_steps 表记录每次 Agent 任务的完整执行链路（思考→工具调用→结果）。chatMessages 表保存对话历史，前端可按会话恢复并继续聊天。所有数据按 user_id 隔离。",
    layer: 4,
    layerName: "外部配套能力",
    status: "done",
    icon: "💾",
  },
  {
    id: "long-memory",
    name: "工作空间长期记忆",
    description: "Agent 主动写入记忆，下次对话自动注入 System Prompt",
    details:
      "完整闭环：Agent 通过 update_memory 工具写入 workspace_memories 表 → 下次对话自动按重要性排序注入 System Prompt → onFinish 触发记忆自动提取。支持 set/delete 操作，按 category 分类（技术栈、用户偏好、项目约定等）。后续规划引入 pgvector 语义检索。",
    layer: 4,
    layerName: "外部配套能力",
    status: "done",
    icon: "🧩",
  },
  {
    id: "quota-limiter",
    name: "动态配额熔断",
    description: "maxSteps 硬上限 + 每日 Token 分级管控 + 工作空间自助调额",
    details:
      "四层防护：(1) maxSteps 硬截断为 20 步；(2) 每日 Token 配额检查（默认 50 万/工作空间），超标返回 429；(3) 用量达 80% 时 System Prompt 注入提醒让 AI 自动精简；(4) 用户可调用 PATCH /api/workspaces/quota 自助调高工作空间配额（上限 500 万/天），配额次日 0 点自动重置。",
    layer: 4,
    layerName: "外部配套能力",
    status: "done",
    icon: "🚦",
  },
  {
    id: "domain-toolkit",
    name: "领域工具包架构",
    description: "支持按场景插拔专属工具，一套底座承载无限专业领域",
    details:
      "已实现首个领域工具包：数据库诊断 4 件套（db_list_slow_queries / db_get_query_plan / db_get_table_schema / db_execute_query），选择 DB 诊断场景时自动挂载。后续规划：性能日志解析器（parse_performance_log）、DOCX 模板渲染器（render_docx_template）等。每个新场景只需新增工具文件 + 注册即可接入，底座零改动。",
    layer: 4,
    layerName: "外部配套能力",
    status: "done",
    icon: "🧰",
  },
  {
    id: "docx-rw",
    name: "DOCX 复杂样式读写",
    description: "后端工具支持读写 .docx 文件的复杂样式（表格、页眉页脚、目录、批注等），将结构化 JSON 渲染进 Word 模板",
    details:
      "为测试报告专家场景定制的关键后端能力。支持：(1) 读取 .docx 文件中的复杂样式元素（表格嵌套、合并单元格、页眉页脚、目录域、批注/修订）；(2) 将大模型输出的结构化 JSON 数据精确渲染进已有 Word 模板的占位符（书签/内容控件/文本占位符）；(3) 保留原始模板样式与排版，仅替换数据内容；(4) 基于 python-docx / mammoth 等成熟库在后端安全沙箱中执行。补齐后测试报告专家即可实现「分析 → 生成结构化数据 → 渲染进标准报告模板」的全链路闭环。",
    layer: 4,
    layerName: "外部配套能力",
    status: "planned",
    icon: "📄",
  },
];

/** 按层次分组的能力数据 */
export function getCapabilitiesByLayer(): Map<number, CapabilityItem[]> {
  const map = new Map<number, CapabilityItem[]>();
  for (const layer of CAPABILITY_LAYERS) {
    map.set(
      layer.level,
      CAPABILITIES.filter((c) => c.layer === layer.level)
    );
  }
  return map;
}

/** 统计各状态的能力数量 */
export function getCapabilityStats(): {
  done: number;
  wip: number;
  planned: number;
  total: number;
} {
  const done = CAPABILITIES.filter((c) => c.status === "done").length;
  const wip = CAPABILITIES.filter((c) => c.status === "wip").length;
  const planned = CAPABILITIES.filter((c) => c.status === "planned").length;
  return { done, wip, planned, total: CAPABILITIES.length };
}
