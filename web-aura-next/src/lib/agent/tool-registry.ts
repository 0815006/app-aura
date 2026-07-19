/**
 * Aura 智能体工具注册表
 *
 * 维护所有已注册工具的结构化元数据。
 * 当前为静态配置方案（MVP），工具超过 30 个后考虑运行时反射。
 */

export type ToolCategory =
  | "file-discovery"
  | "asset-output"
  | "sandbox-compute"
  | "external-connect"
  | "browser-automation"
  | "memory"
  | "db-diagnostic";

export interface ToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ToolMeta {
  name: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  categoryIcon: string;
  sourceFile: string;
  registered: boolean;
  parameters?: ToolParam[];
}

export const TOOL_CATEGORIES: Record<
  ToolCategory,
  { label: string; icon: string }
> = {
  "file-discovery": { label: "文件发现", icon: "📂" },
  "asset-output": { label: "资产产出", icon: "✏️" },
  "sandbox-compute": { label: "沙箱计算", icon: "🧮" },
  "external-connect": { label: "外部连接", icon: "🌐" },
  memory: { label: "记忆管理", icon: "🧠" },
  "browser-automation": { label: "浏览器自动化", icon: "🌐" },
  "db-diagnostic": { label: "数据库诊断", icon: "🗄️" },
};

export const AGENT_TOOLS: ToolMeta[] = [
  // ============================================================
  // 一、文件与目录感知类（Read & Discovery）
  // ============================================================
  {
    name: "list_directory",
    displayName: "目录探测器",
    description:
      "扫描工作空间中指定目录，返回包含的文件与子目录列表。Agent 用于了解项目结构、查找特定文件。",
    category: "file-discovery",
    categoryIcon: "📂",
    sourceFile: "src/lib/agent/tools/list-directory.ts",
    registered: true,
    parameters: [
      {
        name: "path",
        type: "string",
        required: true,
        description: "要扫描的目录路径（相对于工作空间根目录）",
      },
    ],
  },
  {
    name: "preview_file_lines",
    displayName: "智能预览器",
    description:
      "按行号范围预览大文件内容片段，避免将整个文件灌入上下文。Agent 用于先查看文件局部再决定是否全量读取。",
    category: "file-discovery",
    categoryIcon: "📂",
    sourceFile: "src/lib/agent/tools/preview-file-lines.ts",
    registered: true,
    parameters: [
      {
        name: "path",
        type: "string",
        required: true,
        description: "要预览的文件路径",
      },
      {
        name: "startLine",
        type: "number",
        required: false,
        description: "起始行号（从 1 开始，默认 1）",
      },
      {
        name: "endLine",
        type: "number",
        required: false,
        description: "结束行号（默认 50）",
      },
    ],
  },
  {
    name: "read_file_full",
    displayName: "全文读取器",
    description:
      "读取指定文件的完整内容并返回。Agent 用于深入阅读关键源代码、配置文件或日志。",
    category: "file-discovery",
    categoryIcon: "📂",
    sourceFile: "src/lib/agent/tools/read-file-full.ts",
    registered: true,
    parameters: [
      {
        name: "path",
        type: "string",
        required: true,
        description: "要读取的文件路径",
      },
    ],
  },

  // ============================================================
  // 二、资产产出与修改类（Write & Mutation）
  // ============================================================
  {
    name: "create_directory",
    displayName: "目录创建器",
    description:
      "在工作空间中创建新目录（及所需父目录）。Agent 用于组织项目结构、创建输出目录等。",
    category: "asset-output",
    categoryIcon: "✏️",
    sourceFile: "src/lib/agent/tools/create-directory.ts",
    registered: true,
    parameters: [
      {
        name: "path",
        type: "string",
        required: true,
        description: "要创建的目录路径",
      },
    ],
  },
  {
    name: "write_text_file",
    displayName: "基础文本写入",
    description:
      "将文本内容写入工作空间中的指定文件。Agent 用于生成代码、配置文件、报告文档等。",
    category: "asset-output",
    categoryIcon: "✏️",
    sourceFile: "src/lib/agent/tools/write-text-file.ts",
    registered: true,
    parameters: [
      {
        name: "path",
        type: "string",
        required: true,
        description: "目标文件路径",
      },
      {
        name: "content",
        type: "string",
        required: true,
        description: "要写入的文本内容",
      },
    ],
  },
  {
    name: "generate_structured_excel",
    displayName: "结构化表格生成",
    description:
      "根据结构化数据生成 Excel 表格文件。Agent 用于导出数据报表、生成分析结果等场景。",
    category: "asset-output",
    categoryIcon: "✏️",
    sourceFile: "src/lib/agent/tools/generate-structured-excel.ts",
    registered: true,
    parameters: [
      {
        name: "filename",
        type: "string",
        required: true,
        description: "输出的 Excel 文件名",
      },
      {
        name: "sheets",
        type: "array",
        required: true,
        description: "工作表数据数组，每个包含 sheetName 和 rows",
      },
    ],
  },

  // ============================================================
  // 三、动态计算与代码执行类（Sandbox & Compute）
  // ============================================================
  {
    name: "execute_python_code",
    displayName: "Python 沙箱执行器",
    description:
      "在受限沙箱环境中执行 Python 代码并返回输出。Agent 用于数据分析、脚本验证、算法验证等。",
    category: "sandbox-compute",
    categoryIcon: "🧮",
    sourceFile: "src/lib/agent/tools/execute-python-code.ts",
    registered: true,
    parameters: [
      {
        name: "code",
        type: "string",
        required: true,
        description: "要执行的 Python 代码",
      },
      {
        name: "timeout",
        type: "number",
        required: false,
        description: "执行超时时间（秒，默认 30）",
      },
    ],
  },

  // ============================================================
  // 四、外部世界连接类（Connectivity）
  // ============================================================
  {
    name: "web_search",
    displayName: "实时联网搜索",
    description:
      "通过搜索引擎获取互联网上的最新信息。Agent 用于查找文档、获取最新资讯、补充知识盲区。",
    category: "external-connect",
    categoryIcon: "🌐",
    sourceFile: "src/lib/agent/tools/web-search.ts",
    registered: true,
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "搜索查询词",
      },
      {
        name: "maxResults",
        type: "number",
        required: false,
        description: "最大返回结果数（默认 5）",
      },
    ],
  },
  {
    name: "http_request",
    displayName: "通用网络请求",
    description:
      "发起 HTTP 请求与外部 API 交互。Agent 用于调用第三方 API、获取在线数据、对接外部服务。",
    category: "external-connect",
    categoryIcon: "🌐",
    sourceFile: "src/lib/agent/tools/http-request.ts",
    registered: true,
    parameters: [
      {
        name: "url",
        type: "string",
        required: true,
        description: "请求 URL",
      },
      {
        name: "method",
        type: "string",
        required: false,
        description: "HTTP 方法（GET/POST/PUT/DELETE，默认 GET）",
      },
      {
        name: "headers",
        type: "object",
        required: false,
        description: "自定义请求头",
      },
      {
        name: "body",
        type: "string",
        required: false,
        description: "请求体（JSON 字符串）",
      },
    ],
  },

  // ============================================================
  // 五、浏览器自动化类（Browser Automation）—— 场景专属
  // ============================================================
  {
    name: "execute_playwright_validation",
    displayName: "Playwright DOM 抓取器",
    description:
      "驱动服务器端无头浏览器（Chromium），注入登录态参数，跳转到目标系统页面抓取 DOM 结构与可见文本。支持 Cookie 注入/表单登录/无鉴权三种模式。用于 UI 原型契约校验场景。",
    category: "browser-automation",
    categoryIcon: "🌐",
    sourceFile: "src/lib/agent/tools/execute-playwright-validation.ts",
    registered: true,
    parameters: [
      {
        name: "targetUrl",
        type: "string",
        required: true,
        description: "目标系统页面的完整 URL",
      },
      {
        name: "authConfig",
        type: "object",
        required: false,
        description: "鉴权配置（COOKIE_INJECTION / FORM_LOGIN / NONE）",
      },
      {
        name: "waitForSelector",
        type: "string",
        required: false,
        description: "等待某个 CSS 选择器出现后再开始抓取（SPA 异步渲染）",
      },
    ],
  },
  {
    name: "save_ui_audit_report",
    displayName: "UI 审计报告生成器",
    description:
      "将原型契约要求与实际抓取的页面文本进行对比，生成银行合规审计报告（Markdown + JSON），固化到工作空间 outputs/ui-test/ 目录。",
    category: "asset-output",
    categoryIcon: "✏️",
    sourceFile: "src/lib/agent/tools/save-ui-audit-report.ts",
    registered: true,
    parameters: [
      {
        name: "reportTitle",
        type: "string",
        required: true,
        description: "审计报告标题",
      },
      {
        name: "textElements",
        type: "array",
        required: true,
        description: "文本要素比对清单（expectedText + status + severity）",
      },
      {
        name: "overallVerdict",
        type: "enum",
        required: true,
        description: "整体审计结论（PASSED / FAILED / WARNING）",
      },
    ],
  },

  // ============================================================
  // 六、记忆管理类（Memory）
  // ============================================================
  {
    name: "update_memory",
    displayName: "工作空间记忆更新",
    description:
      "更新工作空间的长期记忆。Agent 在发现重要项目特征、用户偏好或约定时主动调用，下次对话自动注入。",
    category: "memory",
    categoryIcon: "🧠",
    sourceFile: "src/lib/agent/tools/update-memory.ts",
    registered: true,
    parameters: [
      {
        name: "key",
        type: "string",
        required: true,
        description: "记忆键（如 project-stack、coding-style）",
      },
      {
        name: "content",
        type: "string",
        required: true,
        description: "记忆内容（Markdown 格式）",
      },
      {
        name: "category",
        type: "enum",
        required: false,
        description:
          "记忆类别：tech-stack | convention | user-pref | fact | general",
      },
      {
        name: "importance",
        type: "number",
        required: false,
        description: "重要性评分（0-10，默认 5）",
      },
      {
        name: "action",
        type: "enum",
        required: false,
        description: "操作类型：set（默认）| delete",
      },
    ],
  },

  // ============================================================
  // 七、数据库诊断类（DB Diagnostic）—— 场景专属
  // ============================================================
  {
    name: "db_list_slow_queries",
    displayName: "慢查询抓取器",
    description:
      "从 PostgreSQL pg_stat_statements 或 MySQL performance_schema 中获取最近执行最慢的 SQL 查询列表。需要数据库已开启相关扩展。",
    category: "db-diagnostic",
    categoryIcon: "🗄️",
    sourceFile: "src/lib/agent/tools/db/db-list-slow-queries.ts",
    registered: true,
    parameters: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "返回条数（默认 10，最大 50）",
      },
    ],
  },
  {
    name: "db_get_query_plan",
    displayName: "执行计划分析器",
    description:
      "获取 SQL 语句的 EXPLAIN 执行计划（JSON 格式），自动拼接 ANALYZE + BUFFERS。对写操作自动包裹 ROLLBACK 事务保护，防止误修改数据。",
    category: "db-diagnostic",
    categoryIcon: "🗄️",
    sourceFile: "src/lib/agent/tools/db/db-get-query-plan.ts",
    registered: true,
    parameters: [
      {
        name: "sql",
        type: "string",
        required: true,
        description: "需要分析的 SQL 语句",
      },
      {
        name: "analyze",
        type: "boolean",
        required: false,
        description: "是否使用 ANALYZE 实际执行（默认 true，写操作自动 ROLLBACK 保护）",
      },
    ],
  },
  {
    name: "db_get_table_schema",
    displayName: "表结构探查器",
    description:
      "获取指定表的结构信息：字段名、类型、是否可空、默认值，以及当前已有索引的名称、字段和类型。支持 schema.table 格式。",
    category: "db-diagnostic",
    categoryIcon: "🗄️",
    sourceFile: "src/lib/agent/tools/db/db-get-table-schema.ts",
    registered: true,
    parameters: [
      {
        name: "table_name",
        type: "string",
        required: true,
        description: "表名（支持 schema.table 格式，如 public.orders）",
      },
    ],
  },
  {
    name: "db_execute_query",
    displayName: "只读查询执行器",
    description:
      "在已连接数据库中执行只读 SQL（仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN/WITH），后端强制拦截写操作。最多返回 1000 行，查询超时 30 秒。",
    category: "db-diagnostic",
    categoryIcon: "🗄️",
    sourceFile: "src/lib/agent/tools/db/db-execute-query.ts",
    registered: true,
    parameters: [
      {
        name: "sql",
        type: "string",
        required: true,
        description: "只读 SQL 语句（仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN/WITH）",
      },
    ],
  },
];

/** 按分类获取工具 */
export function getToolsByCategory(): Map<ToolCategory, ToolMeta[]> {
  const map = new Map<ToolCategory, ToolMeta[]>();
  for (const cat of Object.keys(TOOL_CATEGORIES) as ToolCategory[]) {
    map.set(
      cat,
      AGENT_TOOLS.filter((t) => t.category === cat)
    );
  }
  return map;
}

/** 获取工具统计 */
export function getToolStats(): {
  total: number;
  registered: number;
  unregistered: number;
} {
  const registered = AGENT_TOOLS.filter((t) => t.registered).length;
  return {
    total: AGENT_TOOLS.length,
    registered,
    unregistered: AGENT_TOOLS.length - registered,
  };
}
