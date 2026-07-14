import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolve } from 'path';

// Drizzle Kit 无法自动读取 Next.js 的 .env.local，手动加载
config({ path: resolve(__dirname, '.env.local') });

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://root:root@localhost:5432/aura_db',
  },
});
