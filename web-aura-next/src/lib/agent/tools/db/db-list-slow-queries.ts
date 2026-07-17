/**
 * 抓取慢查询列表 —— db_list_slow_queries
 *
 * 从数据库系统视图中获取最近执行最慢的 SQL 查询列表。
 * PostgreSQL: 查询 pg_stat_statements 视图
 * MySQL: 查询 performance_schema.events_statements_summary_by_digest
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { getToolContext } from "@/lib/agent/tool-context";
import { getOrCreatePool } from "./db-pool-manager";
import { db } from "@/lib/db/client";
import { dbConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/auth/crypto";
import { Pool } from "pg";
import type { Pool as MysqlPool } from "mysql2/promise";

async function getDbPool(): Promise<{
  pool: Pool | MysqlPool;
  dbType: string;
}> {
  const ctx = getToolContext();
  if (!ctx?.dbConnectionId) {
    throw new Error("当前未连接数据库，请先选择数据库连接");
  }

  const conn = await db.query.dbConnections.findFirst({
    where: and(
      eq(dbConnections.id, ctx.dbConnectionId),
      eq(dbConnections.status, "active")
    ),
  });

  if (!conn) {
    throw new Error("数据库连接不存在或已失效");
  }

  const password = decrypt(conn.passwordEncrypted);

  return {
    pool: await getOrCreatePool(ctx.dbConnectionId, {
      dbType: conn.dbType as "postgresql" | "mysql",
      host: conn.host,
      port: conn.port,
      dbName: conn.dbName,
      username: conn.username,
      password,
      sslMode: conn.sslMode ?? undefined,
    }),
    dbType: conn.dbType,
  };
}

export const dbListSlowQueries = tool({
  description:
    "从数据库系统视图中获取最近执行最慢的 SQL 查询列表。" +
    "需要数据库已开启 pg_stat_statements 扩展（PostgreSQL）或 performance_schema（MySQL）。" +
    "返回按平均执行时间降序排列的慢查询。",
  parameters: z.object({
    limit: z
      .number()
      .default(10)
      .describe("返回条数，默认 10，最大 50"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: { limit: number }): Promise<string> => {
    try {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);

      const { pool, dbType } = await getDbPool();

      if (dbType === "postgresql") {
        const pgPool = pool as Pool;

        // 检查 pg_stat_statements 扩展是否可用
        try {
          const slowResult = await pgPool.query(
            `SELECT
              queryid,
              query,
              calls,
              mean_exec_time::numeric(20,2) AS avg_ms,
              total_exec_time::numeric(20,2) AS total_ms,
              min_exec_time::numeric(20,2) AS min_ms,
              max_exec_time::numeric(20,2) AS max_ms,
              rows,
              shared_blks_hit,
              shared_blks_read,
              shared_blks_hit + shared_blks_read AS total_shared_blks
            FROM pg_stat_statements
            WHERE query NOT LIKE '%pg_stat_statements%'
              AND query NOT LIKE '%pg_stat_%'
            ORDER BY mean_exec_time DESC
            LIMIT $1`,
            [limit]
          );

          const queries = slowResult.rows.map((row) => ({
            queryId: row.queryid,
            query: row.query?.slice(0, 500),
            calls: row.calls,
            avgMs: parseFloat(row.avg_ms || "0"),
            totalMs: parseFloat(row.total_ms || "0"),
            minMs: parseFloat(row.min_ms || "0"),
            maxMs: parseFloat(row.max_ms || "0"),
            rows: row.rows,
            sharedBlocksHit: row.shared_blks_hit,
            sharedBlocksRead: row.shared_blks_read,
          }));

          return JSON.stringify({
            status: "success",
            source: "pg_stat_statements",
            count: queries.length,
            queries,
          });
        } catch {
          // pg_stat_statements 不可用，返回安装指南
          return JSON.stringify({
            status: "warning",
            source: "pg_stat_statements (不可用)",
            message:
              "pg_stat_statements 扩展未安装或不可访问。" +
              "请在数据库中以超级用户身份执行以下命令来启用:\n" +
              "  1. 编辑 postgresql.conf，设置 shared_preload_libraries = 'pg_stat_statements'\n" +
              "  2. 重启 PostgreSQL\n" +
              "  3. 在目标数据库中执行: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;\n" +
              "  4. 执行: SELECT pg_stat_statements_reset(); 重置统计",
            installGuide: [
              "编辑 postgresql.conf: shared_preload_libraries = 'pg_stat_statements'",
              "重启 PostgreSQL",
              "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
              "SELECT pg_stat_statements_reset();",
            ],
            queries: [],
          });
        }
      }

      // MySQL
      const mysqlPool = pool as unknown as MysqlPool;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [mysqlRows] = await (mysqlPool as any).execute(
          `SELECT
            DIGEST_TEXT AS query,
            COUNT_STAR AS calls,
            AVG_TIMER_WAIT / 1000000000 AS avg_ms,
            SUM_TIMER_WAIT / 1000000000 AS total_ms,
            MIN_TIMER_WAIT / 1000000000 AS min_ms,
            MAX_TIMER_WAIT / 1000000000 AS max_ms,
            SUM_ROWS_SENT AS rows_sent,
            SUM_ROWS_EXAMINED AS rows_examined
          FROM performance_schema.events_statements_summary_by_digest
          WHERE DIGEST_TEXT IS NOT NULL
            AND DIGEST_TEXT NOT LIKE '%performance_schema%'
          ORDER BY AVG_TIMER_WAIT DESC
          LIMIT ?`,
          [limit]
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queries = (mysqlRows as any[]).map((row: any) => ({
          query: row.query?.slice(0, 500),
          calls: row.calls,
          avgMs: parseFloat(row.avg_ms || "0"),
          totalMs: parseFloat(row.total_ms || "0"),
          minMs: parseFloat(row.min_ms || "0"),
          maxMs: parseFloat(row.max_ms || "0"),
          rowsSent: row.rows_sent,
          rowsExamined: row.rows_examined,
        }));

        return JSON.stringify({
          status: "success",
          source: "performance_schema.events_statements_summary_by_digest",
          count: queries.length,
          queries,
        });
      } catch {
        return JSON.stringify({
          status: "warning",
          source: "performance_schema (不可用)",
          message:
            "MySQL performance_schema 未启用或 events_statements_summary_by_digest 表不可访问。" +
            "请在 MySQL 配置中启用 performance_schema:\n" +
            "  1. 编辑 my.cnf: performance_schema = ON\n" +
            "  2. 重启 MySQL\n" +
            "  3. 确保 performance_schema 消费者已启用",
          queries: [],
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      console.error(`[db_list_slow_queries] ❌ 获取慢查询失败: ${message}`);
      return JSON.stringify({
        error: true,
        message: `db_list_slow_queries 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
