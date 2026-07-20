/**
 * 数据库迁移执行器（生产环境直接 node 运行）
 *
 * 用法：
 *   node src/lib/db/migrate.cjs
 *
 * 依赖：仅 pg + Node.js 内置模块（fs/path）
 * 无需 drizzle-orm / dotenv / tsx
 *
 * 流程：
 *   1. 从 .env 加载 DATABASE_URL
 *   2. 启用 pgvector 扩展
 *   3. 按文件名排序执行 drizzle/ 下未应用的 SQL 迁移
 */

const { readFileSync, readdirSync } = require('fs');
const { resolve, basename } = require('path');
const { Pool } = require('pg');

// ---- 加载 .env ----
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '..', '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx === -1) continue;
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
    console.log('✅ .env 已加载');
  } catch {
    console.log('⚠️  未找到 .env，使用现有环境变量');
  }
}

// ---- 确保迁移追踪表存在（兼容 Drizzle 的 __drizzle_migrations） ----
const MIGRATIONS_TABLE = '__drizzle_migrations';

async function ensureMigrationsTable(pool) {
  // Drizzle 的迁移表结构: (id, hash, created_at)
  // 如果已存在则直接用，否则创建兼容表
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = $1)`,
    [MIGRATIONS_TABLE]
  );
  if (rows[0].exists !== true && rows[0].exists !== 't') {
    await pool.query(`
      CREATE TABLE ${MIGRATIONS_TABLE} (
        id         SERIAL PRIMARY KEY,
        hash       TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('✅ 迁移追踪表已创建');
  }
}

// ---- 获取已执行的迁移列表 ----
async function getAppliedMigrations(pool) {
  const { rows } = await pool.query(
    `SELECT hash FROM ${MIGRATIONS_TABLE} ORDER BY id`
  );
  return new Set(rows.map((r) => r.hash));
}

async function run() {
  loadEnv();

  const connectionString =
    process.env.DATABASE_URL || 'postgresql://root:root@localhost:5432/aura_db';

  const pool = new Pool({ connectionString, max: 1 });

  try {
    console.log('⏳ 连接数据库...');
    await pool.query('SELECT 1');

    // 启用 pgvector 扩展
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✅ pgvector 扩展已就绪');

    // 确保迁移追踪表存在
    await ensureMigrationsTable(pool);

    // 读取迁移文件
    const drizzleDir = resolve(__dirname, '..', '..', '..', 'drizzle');
    const files = readdirSync(drizzleDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('⚠️  drizzle/ 目录下无 SQL 迁移文件');
      return;
    }

    const applied = await getAppliedMigrations(pool);
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('✅ 所有迁移已执行，无需操作');
      return;
    }

    // 首次运行（追踪表刚创建）→ 把所有已有 SQL 标记为已执行，不重复跑
    if (applied.size === 0 && pending.length === files.length) {
      const r = await pool.query(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'users')`
      );
      if (r.rows[0].exists) {
        console.log('⚠️  检测到已有数据库但无迁移记录，标记 %d 个 SQL 为已执行', files.length);
        for (const file of files) {
          await pool.query(
            `INSERT INTO ${MIGRATIONS_TABLE} (hash) VALUES ($1)`,
            [file]
          );
        }
        console.log('✅ 迁移追踪表已初始化，后续新增 SQL 将正常执行');
        return;
      }
    }

    console.log(`📋 待执行迁移: ${pending.length} 个`);
    for (const file of pending) {
      const sql = readFileSync(resolve(drizzleDir, file), 'utf-8');
      console.log(`  ▶ 执行: ${file}`);
      await pool.query(sql);
      await pool.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (hash) VALUES ($1)`,
        [file]
      );
      console.log(`  ✅ 完成: ${file}`);
    }

    console.log('✅ 数据库迁移全部完成');
  } catch (err) {
    console.error('❌ 数据库迁移失败:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
