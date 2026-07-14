/**
 * 数据库迁移执行器 —— 对标 Flyway 的 migrate 命令
 *
 * 用法：
 *   npx tsx src/lib/db/migrate.ts          # 直接执行
 *   npm run db:migrate                     # 通过 scripts 快捷执行
 *
 * 在 dev-start.bat 中通过 --run-migrate 参数自动调用
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// 加载 .env.local（tsx 不会自动加载 Next.js 的环境变量）
config({ path: resolve(__dirname, '..', '..', '..', '.env.local') });

const connectionString =
  process.env.DATABASE_URL || 'postgresql://root:root@localhost:5432/aura_db';

async function runMigration() {
  console.log('⏳ [Drizzle] 连接数据库...');
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  try {
    // 确保 pgvector 扩展已启用
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✅ [Drizzle] pgvector 扩展已就绪');

    // 执行 drizzle/ 目录下所有未应用的迁移 SQL
    const migrationsFolder = resolve(__dirname, '..', '..', '..', 'drizzle');
    await migrate(db, { migrationsFolder });
    console.log('✅ [Drizzle] 数据库迁移完成');
  } catch (err) {
    console.error('❌ [Drizzle] 数据库迁移失败:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 直接运行时执行迁移
runMigration();

export { runMigration };
