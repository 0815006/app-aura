import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
  jsonb,
  customType,
  uuid,
  pgEnum,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================
// pgvector 向量类型定义（兼容 Drizzle customType）
// ============================================================
const vector = customType<{ data: number[] }>({
  dataType() {
    return "vector(1536)";
  },
});

// ============================================================
// 枚举类型
// ============================================================
export const workspaceStatusEnum = pgEnum("workspace_status", [
  "active",
  "archived",
]);

// ============================================================
// 0. 用户表 (users) — 极简账户系统
// ============================================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(), // bcrypt hash
  displayName: varchar("display_name", { length: 100 }),
  createTime: timestamp("create_time", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updateTime: timestamp("update_time", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================
// 0.5. 用户模型配置表 (user_model_configs)
// 每个用户可配置多个模型（DeepSeek / OpenAI 等），
// api_key 使用 AES-256-GCM 加密存储。
// ============================================================
export const userModelConfigs = pgTable(
  "user_model_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(), // 用户自定义标签
    modelName: varchar("model_name", { length: 100 }).notNull(), // 实际模型名 (e.g. deepseek-chat)
    apiKeyEncrypted: text("api_key_encrypted").notNull(), // AES-256-GCM 加密后的 Key
    baseUrl: text("base_url").default("https://api.deepseek.com/v1"),
    isDefault: boolean("is_default").default(false),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_user_model_configs_user_id").on(table.userId),
    uniqueUserLabel: uniqueIndex("uidx_user_label").on(
      table.userId,
      table.label
    ),
  })
);

// ============================================================
// 1. 工作空间表 (workspaces) —— 仅服务端
// ============================================================
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contextSnapshot: jsonb("context_snapshot"),
    status: workspaceStatusEnum("status").default("active").notNull(),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_workspaces_user_id").on(table.userId),
  })
);

// ============================================================
// 2. 聊天记录表 (chat_messages)
// ============================================================
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("session_id", { length: 255 }).notNull(),
    workspaceId: uuid("workspace_id"), // 关联 workspace（客户端模式为 null）
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull(), // 'user' | 'assistant' | 'system'
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls"),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionIdx: index("idx_chat_messages_session_id").on(table.sessionId),
    workspaceIdx: index("idx_chat_messages_workspace_id").on(table.workspaceId),
    userIdIdx: index("idx_chat_messages_user_id").on(table.userId),
    createTimeIdx: index("idx_chat_messages_create_time").on(table.createTime),
  })
);

// ============================================================
// 3. 向量知识库表 (agent_knowledge)
// ============================================================
export const agentKnowledge = pgTable(
  "agent_knowledge",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 50 }),
    sourcePath: varchar("source_path", { length: 500 }),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    categoryIdx: index("idx_agent_knowledge_category").on(table.category),
    userIdIdx: index("idx_agent_knowledge_user_id").on(table.userId),
  })
);
