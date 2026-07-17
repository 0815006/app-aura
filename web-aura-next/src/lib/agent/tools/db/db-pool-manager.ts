/**
 * DB 连接池管理器 — 会话级连接池生命周期管理
 *
 * 为每个 dbConnectionId 创建临时连接池，在 streamText onFinish 时释放。
 * 支持 PostgreSQL (pg) 和 MySQL (mysql2/promise) 两种驱动。
 */

import { Pool } from "pg";
import type { Pool as MysqlPool } from "mysql2/promise";

export interface DbConnectionConfig {
  dbType: "postgresql" | "mysql";
  host: string;
  port: number;
  dbName: string;
  username: string;
  password: string;
  sslMode?: string;
}

interface PoolEntry {
  pool: Pool | MysqlPool;
  dbType: "postgresql" | "mysql";
  createdAt: number;
}

/** 会话级连接池：key = dbConnectionId */
const sessionPools = new Map<string, PoolEntry>();

/**
 * 获取或创建连接池
 */
export async function getOrCreatePool(
  connectionId: string,
  config: DbConnectionConfig
): Promise<Pool | MysqlPool> {
  const existing = sessionPools.get(connectionId);
  if (existing) return existing.pool;

  if (config.dbType === "postgresql") {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.dbName,
      user: config.username,
      password: config.password,
      ssl: config.sslMode === "require" ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // maxLifetime not supported by pg PoolConfig types
    });

    sessionPools.set(connectionId, {
      pool,
      dbType: "postgresql",
      createdAt: Date.now(),
    });

    console.log(
      `[DB Pool] ✅ 创建 PostgreSQL 连接池: ${config.host}:${config.port}/${config.dbName}`
    );
    return pool;
  }

  if (config.dbType === "mysql") {
    try {
      const mysql2 = await import("mysql2/promise");
      const pool = mysql2.createPool({
        host: config.host,
        port: config.port,
        database: config.dbName,
        user: config.username,
        password: config.password,
        ssl: config.sslMode === "true" ? {} : undefined,
        connectionLimit: 5,
        idleTimeout: 30_000,
        connectTimeout: 10_000,
        maxIdle: 5,
        waitForConnections: true,
      });

      sessionPools.set(connectionId, {
        pool: pool as unknown as MysqlPool,
        dbType: "mysql",
        createdAt: Date.now(),
      });

      console.log(
        `[DB Pool] ✅ 创建 MySQL 连接池: ${config.host}:${config.port}/${config.dbName}`
      );
      return pool as unknown as MysqlPool;
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      throw new Error(`MySQL 连接池创建失败 (mysql2 驱动可能未安装): ${message}`);
    }
  }

  throw new Error(`不支持的数据库类型: ${config.dbType}`);
}

/**
 * 释放单个连接池
 */
export async function releasePool(connectionId: string): Promise<void> {
  const entry = sessionPools.get(connectionId);
  if (!entry) return;

  try {
    if (entry.dbType === "postgresql") {
      await (entry.pool as Pool).end();
    } else {
      await (entry.pool as MysqlPool).end();
    }
    console.log(`[DB Pool] 🔌 连接池已释放: ${connectionId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error(`[DB Pool] ⚠️ 释放连接池失败: ${connectionId} — ${message}`);
  } finally {
    sessionPools.delete(connectionId);
  }
}

/**
 * 释放所有会话级连接池（在 onFinish / 异常处理中调用）
 */
export async function releaseAllPools(): Promise<void> {
  const ids = Array.from(sessionPools.keys());
  if (ids.length === 0) return;

  console.log(`[DB Pool] 🔌 释放所有连接池 (${ids.length} 个)...`);
  await Promise.all(ids.map((id) => releasePool(id)));
}

/**
 * 获取连接池中的连接（用于判断 dbType）
 */
export function getPoolDbType(connectionId: string): "postgresql" | "mysql" | null {
  return sessionPools.get(connectionId)?.dbType ?? null;
}
