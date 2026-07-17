/**
 * 获取执行计划 —— db_get_query_plan
 *
 * 获取一条 SQL 语句的 EXPLAIN 执行计划（JSON 格式）。
 * 自动拼接 EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 前缀。
 * 写操作自动包裹 ROLLBACK 事务保护。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { getToolContext } from "@/lib/agent/tool-context";
import { getOrCreatePool, getPoolDbType } from "./db-pool-manager";
import { db } from "@/lib/db/client";
import { dbConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/auth/crypto";
import { Pool } from "pg";
import type { Pool as MysqlPool } from "mysql2/promise";

/** 判断 SQL 是否为写操作 */
const WRITE_PATTERN = /\b(UPDATE|DELETE|INSERT|DROP|TRUNCATE|ALTER|CREATE)\b/i;

async function getDbPool() {
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

  return { pool: await getOrCreatePool(ctx.dbConnectionId, {
    dbType: conn.dbType as "postgresql" | "mysql",
    host: conn.host,
    port: conn.port,
    dbName: conn.dbName,
    username: conn.username,
    password,
    sslMode: conn.sslMode ?? undefined,
  }), dbType: conn.dbType };
}

export const dbGetQueryPlan = tool({
  description:
    "获取一条 SQL 语句的 EXPLAIN 执行计划（JSON 格式）。" +
    "自动拼接 EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 前缀。" +
    "如果 analyze=true 且 SQL 是写操作，会自动包裹为 ROLLBACK 事务以保护数据安全。",
  parameters: z.object({
    sql: z.string().describe("需要分析的 SQL 语句"),
    analyze: z
      .boolean()
      .default(true)
      .describe("是否使用 ANALYZE 实际执行并获取真实耗时"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: { sql: string; analyze: boolean }): Promise<string> => {
    try {
      const sql = args.sql?.trim() ?? "";
      const analyze = args.analyze !== false;

      if (!sql) {
        return JSON.stringify({
          error: true,
          message: "db_get_query_plan 失败: SQL 语句不能为空",
        });
      }

      const { pool, dbType } = await getDbPool();
      const isWriteOp = WRITE_PATTERN.test(sql);
      const actualAnalyze = analyze && !isWriteOp; // 写操作不使用 ANALYZE

      if (dbType === "postgresql" || dbType === "postgresql") {
        const pgPool = pool as Pool;

        // PostgreSQL EXPLAIN
        const options: string[] = ["FORMAT JSON"];
        if (actualAnalyze) {
          options.push("ANALYZE", "BUFFERS");
        }

        let querySql = `EXPLAIN (${options.join(", ")}) ${sql}`;

        // 写操作包裹 ROLLBACK 事务
        if (isWriteOp && analyze) {
          querySql = `BEGIN; ${querySql}; ROLLBACK;`;
        }

        const result = await pgPool.query(querySql);

        // 提取 EXPLAIN JSON 结果
        // EXPLAIN (FORMAT JSON) 返回的 plan 在 rows[0]["QUERY PLAN"] 中
        const planRaw = result.rows[0]?.["QUERY PLAN"] ?? result.rows;

        return JSON.stringify({
          status: "success",
          isWriteOperation: isWriteOp,
          analyzeUsed: actualAnalyze,
          plan: planRaw,
          note: isWriteOp && analyze
            ? "⚠️ 检测到写操作，未使用 ANALYZE（数据安全）。如需分析写操作性能，请手动使用 EXPLAIN。"
            : undefined,
        });
      }

      // MySQL EXPLAIN
      const mysqlPool = pool as unknown as MysqlPool;

      let querySql: string;
      if (actualAnalyze) {
        querySql = `EXPLAIN ANALYZE ${sql}`;
      } else {
        querySql = `EXPLAIN FORMAT=JSON ${sql}`;
      }

      // 写操作包裹事务回滚
      if (isWriteOp && analyze) {
        querySql = `START TRANSACTION; ${querySql}; ROLLBACK;`;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [rows] = await (mysqlPool as any).execute(querySql);

      return JSON.stringify({
        status: "success",
        isWriteOperation: isWriteOp,
        analyzeUsed: actualAnalyze,
        plan: rows,
        note: isWriteOp && analyze
          ? "⚠️ 检测到写操作，未使用 ANALYZE（数据安全）。如需分析写操作性能，请手动使用 EXPLAIN。"
          : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      console.error(`[db_get_query_plan] ❌ 获取执行计划失败: ${message}`);
      return JSON.stringify({
        error: true,
        message: `db_get_query_plan 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
