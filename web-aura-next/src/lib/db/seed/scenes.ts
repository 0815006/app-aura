/**
 * 场景种子数据 — 预置"数据库诊断专家"场景
 *
 * 在应用启动时调用，检查场景是否已存在，若无则插入。
 * 后续可通过管理界面扩充更多场景。
 */
import { db } from "@/lib/db/client";
import { sceneDefinitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DB_DIAG_SCENE = {
  slug: "db-slow-query-analyzer",
  name: "数据库慢 SQL 性能分析",
  description:
    "连接指定数据库，分析慢 SQL 语句，自动诊断执行计划与性能瓶颈，生成优化方案。",
  icon: "🗄️",
  systemPrompt: `你是一名资深的 PostgreSQL/MySQL 性能诊断专家与高级 DBA。

## 🎯 核心任务
1. 根据用户提供的诊断目标（慢 SQL、存储过程或性能瓶颈描述），自主利用数据库工具进行排查。
2. 你必须通过多步工具调用，从"查表结构 → 抓慢 SQL → 分析执行计划"逐步深入，严禁在没有拿到执行计划的情况下给出肤浅建议。
3. 诊断结束后，将最终的性能诊断与优化方案编写成 Markdown 报告，连同优化 SQL 脚本（如 CREATE INDEX），写入工作空间目录。

## 🚫 行为约束
- 安全红线：严禁执行任何修改数据的操作（UPDATE/DELETE/DROP/TRUNCATE/ALTER）。如果必须分析写操作语句，使用 EXPLAIN（不加 ANALYZE）。
- 只在工具返回结果后才给出分析结论，不要凭空猜测。
- 关注全表扫描（Seq Scan）、文件排序（File Sort）、临时表（Temporary）等性能瓶颈信号。
- 使用中文回复。

## 🔧 可用数据库工具
- db_list_slow_queries({ limit? }) — 从系统视图获取最近慢查询列表
- db_get_query_plan({ sql, analyze? }) — 获取 SQL 的 EXPLAIN 执行计划（JSON 格式）
- db_get_table_schema({ table_name }) — 获取表结构、字段类型、现有索引
- db_execute_query({ sql }) — 执行只读 SQL（仅 SELECT/SHOW/DESCRIBE/EXPLAIN）`,
  toolWhitelist: null,
  requiredInputs: [
    {
      key: "sql_file",
      label: "待分析的 SQL 文件路径",
      type: "text",
      placeholder: "如 slow.sql 或留空由 AI 自动抓取",
    },
  ],
  dbRequired: true,
  sortOrder: 1,
  status: "active",
};

/**
 * 初始化场景种子数据
 * 检查"数据库诊断专家"场景是否存在，不存在则插入。
 * 应在服务端启动时调用一次。
 */
export async function seedScenes(): Promise<void> {
  try {
    const existing = await db.query.sceneDefinitions.findFirst({
      where: eq(sceneDefinitions.slug, DB_DIAG_SCENE.slug),
    });

    if (existing) {
      console.log(`[Seed] 场景已存在: ${DB_DIAG_SCENE.name} (slug=${DB_DIAG_SCENE.slug})`);
      return;
    }

    await db.insert(sceneDefinitions).values({
      slug: DB_DIAG_SCENE.slug,
      name: DB_DIAG_SCENE.name,
      description: DB_DIAG_SCENE.description,
      icon: DB_DIAG_SCENE.icon,
      systemPrompt: DB_DIAG_SCENE.systemPrompt,
      toolWhitelist: DB_DIAG_SCENE.toolWhitelist,
      requiredInputs: DB_DIAG_SCENE.requiredInputs,
      dbRequired: DB_DIAG_SCENE.dbRequired,
      sortOrder: DB_DIAG_SCENE.sortOrder,
      status: DB_DIAG_SCENE.status,
    });

    console.log(`[Seed] ✅ 场景已创建: ${DB_DIAG_SCENE.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error(`[Seed] ❌ 场景种子数据写入失败: ${message}`);
  }
}
