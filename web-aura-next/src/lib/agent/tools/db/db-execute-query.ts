/**
 * 通用只读查询 —— db_execute_query
 *
 * 在已连接的数据库中执行只读 SQL 查询，返回结构化 JSON 结果集。
 * 后端强制执行 SQL 安全校验：仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN/WITH。
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

/** SQL 安全校验：仅允许只读操作 */
const READ_ONLY_PATTERN =
  /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i;

const FORBIDDEN_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE)\b/i;

/**
 * 获取当前请求的数据库连接池（从 toolContext 中读取 connectionId）
 */
async function getDbPool() {
  const ctx = getToolContext();
  if (!ctx?.dbConnectionId) {
    throw new Error("当前未连接数据库，请先选择数据库连接");
  }

  // 从 DB 加载连接配置
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

  return getOrCreatePool(ctx.dbConnectionId, {
    dbType: conn.dbType as "postgresql" | "mysql",
    host: conn.host,
    port: conn.port,
    dbName: conn.dbName,
    username: conn.username,
    password,
    sslMode: conn.sslMode ?? undefined,
  });
}

export const dbExecuteQuery = tool({
  description:
    "在已连接的数据库中执行只读 SQL 查询（仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN）。" +
    "返回结构化的 JSON 结果集。最多返回 1000 行，查询超时 30 秒。" +
    "使用此工具查询业务数据，如查看订单信息、用户列表等。",
  parameters: z.object({
    sql: z.string().describe("要执行的只读 SQL 语句"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: { sql: string }): Promise<string> => {
    try {
      const sql = args.sql?.trim() ?? "";

      if (!sql) {
        return JSON.stringify({
          error: true,
          message: "db_execute_query 失败: SQL 语句不能为空",
        });
      }

      // 安全校验：仅允许只读操作
      if (!READ_ONLY_PATTERN.test(sql)) {
        return JSON.stringify({
          error: true,
          message:
            "db_execute_query 被拦截: 仅允许只读查询 (SELECT/SHOW/DESCRIBE/EXPLAIN/WITH)",
        });
      }

      // 双重校验：禁止写操作关键字
      if (FORBIDDEN_PATTERN.test(sql)) {
        return JSON.stringify({
          error: true,
          message:
            "db_execute_query 被拦截: SQL 中包含禁止的写操作关键字 (INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER/CREATE/GRANT/REVOKE)",
        });
      }

      const pool = await getDbPool();
      const dbType = getPoolDbType(getToolContext()?.dbConnectionId ?? "");

      if (dbType === "postgresql" || !dbType) {
        // PostgreSQL
        const pgPool = pool as Pool;
        const result = await pgPool.query({
          text: sql,
          rowMode: "array",
        });

        const rows = result.rows.slice(0, 1000);
        const truncated = result.rows.length > 1000;

        return JSON.stringify({
          status: "success",
          rowCount: result.rows.length,
          returnedRows: rows.length,
          truncated,
          fields: result.fields.map((f) => f.name),
          rows,
          command: result.command,
        });
      }

      // MySQL
      const mysqlPool = pool as unknown as MysqlPool;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [rows, fields] = await (mysqlPool as any).execute(sql);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rowArray = (Array.isArray(rows) ? rows : []) as any[];
      const truncated = rowArray.length > 1000;
      const limitedRows = rowArray.slice(0, 1000);
      const fieldNames = Array.isArray(fields)
        ? fields.map((f: { name: string }) => f.name)
        : [];

      return JSON.stringify({
        status: "success",
        rowCount: rowArray.length,
        returnedRows: limitedRows.length,
        truncated,
        fields: fieldNames,
        rows: limitedRows,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      console.error(`[db_execute_query] ❌ 查询失败: ${message}`);
      return JSON.stringify({
        error: true,
        message: `db_execute_query 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
