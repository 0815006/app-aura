import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://root:root@localhost:5432/aura_db';

// 全局单例连接池
const globalPool = new Pool({
  connectionString,
  max: 20, // 最大连接数
  idleTimeoutMillis: 30_000,
});

// 导出 Drizzle 实例（含完整类型推断）
export const db = drizzle(globalPool);

// 导出原始 Pool 以便迁移脚本等场景单独使用
export const pool = globalPool;
