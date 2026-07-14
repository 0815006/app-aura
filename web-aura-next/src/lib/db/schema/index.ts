import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';

// ============================================================
// pgvector 向量类型定义（兼容 Drizzle customType）
// ============================================================
const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(1536)';
  },
});

// ============================================================
// 1. 聊天记录表 (chat_messages)
// 每轮对话结束后通过 onFinish 回调持久化，支持跨设备恢复
// ============================================================
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    sessionId: varchar('session_id', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    // 工具调用元数据（JSONB 存储 toolName / args / result）
    toolCalls: jsonb('tool_calls'),
    createTime: timestamp('create_time', { withTimezone: true }).defaultNow().notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index('idx_chat_messages_session_id').on(table.sessionId),
    createTimeIdx: index('idx_chat_messages_create_time').on(table.createTime),
  }),
);

// ============================================================
// 2. 向量知识库表 (agent_knowledge)
// 存放文档段落、代码片段、运维 SOP 等，支持 RAG 语义检索
// ============================================================
export const agentKnowledge = pgTable(
  'agent_knowledge',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content').notNull(),
    // pgvector 1536 维向量（如 OpenAI text-embedding-ada-002 / DeepSeek 兼容）
    embedding: vector('embedding'),
    category: varchar('category', { length: 50 }), // 'dba' | 'perf' | 'monitor' | 'general'
    // 来源文件路径（如 docs/xxx.md）
    sourcePath: varchar('source_path', { length: 500 }),
    createTime: timestamp('create_time', { withTimezone: true }).defaultNow().notNull(),
    updateTime: timestamp('update_time', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index('idx_agent_knowledge_category').on(table.category),
    // HNSW 向量索引（用于近似最近邻检索，需 CREATE EXTENSION vector）
  }),
);
