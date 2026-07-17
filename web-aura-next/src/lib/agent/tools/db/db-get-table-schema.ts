/**
 * 获取表结构与索引 —— db_get_table_schema
 *
 * 获取指定表的结构信息，包括字段名、类型、是否可空、默认值，
 * 以及当前已有的索引名称、索引字段、索引类型。
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
    dbType: conn.dbType as string,
  };
}

export const dbGetTableSchema = tool({
  description:
    "获取指定表的结构信息，包括字段名、类型、是否可空、默认值，" +
    "以及当前已有的索引名称、索引字段、索引类型。" +
    "支持 schema.table 格式（如 'public.users'）。",
  parameters: z.object({
    table_name: z
      .string()
      .describe("要查看的表名（支持 schema.table 格式，如 'public.orders'）"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: { table_name: string }): Promise<string> => {
    try {
      const tableName = args.table_name?.trim() ?? "";

      if (!tableName) {
        return JSON.stringify({
          error: true,
          message: "db_get_table_schema 失败: table_name 不能为空",
        });
      }

      // 解析 schema.table 格式
      let schema = "public";
      let table = tableName;
      const dotIndex = tableName.lastIndexOf(".");
      if (dotIndex > 0) {
        schema = tableName.slice(0, dotIndex);
        table = tableName.slice(dotIndex + 1);
      }

      const { pool, dbType } = await getDbPool();

      if (dbType === "postgresql") {
        const pgPool = pool as Pool;

        // 查询列信息
        const columnsResult = await pgPool.query(
          `SELECT
            column_name,
            data_type,
            udt_name,
            is_nullable,
            column_default,
            character_maximum_length,
            ordinal_position
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
          [schema, table]
        );

        // 查询索引信息
        const indexesResult = await pgPool.query(
          `SELECT
            indexname,
            indexdef
          FROM pg_indexes
          WHERE schemaname = $1 AND tablename = $2
          ORDER BY indexname`,
          [schema, table]
        );

        const columns = columnsResult.rows.map((col) => ({
          name: col.column_name,
          type: col.udt_name || col.data_type,
          nullable: col.is_nullable === "YES",
          default: col.column_default,
          maxLength: col.character_maximum_length,
          position: col.ordinal_position,
        }));

        const indexes = indexesResult.rows.map((idx) => ({
          name: idx.indexname,
          definition: idx.indexdef,
        }));

        return JSON.stringify({
          status: "success",
          table: `${schema}.${table}`,
          columnCount: columns.length,
          indexCount: indexes.length,
          columns,
          indexes,
        });
      }

      // MySQL
      const mysqlPool = pool as unknown as MysqlPool;

      // MySQL: 列信息
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [mysqlColumns] = await (mysqlPool as any).execute(
        `SELECT
          COLUMN_NAME AS column_name,
          DATA_TYPE AS data_type,
          COLUMN_TYPE AS column_type,
          IS_NULLABLE AS is_nullable,
          COLUMN_DEFAULT AS column_default,
          CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
          ORDINAL_POSITION AS ordinal_position
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
        [schema, table]
      );

      // MySQL: 索引
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [mysqlIndexes] = await (mysqlPool as any).execute(
        `SHOW INDEX FROM \`${schema}\`.\`${table}\``
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const columns = (mysqlColumns as any[]).map((col: any) => ({
        name: col.column_name,
        type: col.column_type || col.data_type,
        nullable: col.is_nullable === "YES",
        default: col.column_default,
        maxLength: col.character_maximum_length,
        position: col.ordinal_position,
      }));

      // 聚合 MySQL SHOW INDEX 结果
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const indexMap = new Map<string, { name: string; columns: string[]; unique: boolean }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const idx of mysqlIndexes as any[]) {
        const key = idx.Key_name;
        if (!indexMap.has(key)) {
          indexMap.set(key, {
            name: key,
            columns: [],
            unique: !idx.Non_unique,
          });
        }
        indexMap.get(key)!.columns.push(idx.Column_name);
      }
      const indexes = Array.from(indexMap.values());

      return JSON.stringify({
        status: "success",
        table: `${schema}.${table}`,
        columnCount: columns.length,
        indexCount: indexes.length,
        columns,
        indexes,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      console.error(`[db_get_table_schema] ❌ 获取表结构失败: ${message}`);
      return JSON.stringify({
        error: true,
        message: `db_get_table_schema 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
