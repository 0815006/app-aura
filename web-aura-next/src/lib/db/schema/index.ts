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
  primaryKey,
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
// 0.5. 用户设置表 (user_settings)
// key-value 模式，存储用户级可配置项（联网搜索 Key、默认配额等）。
// 表中无记录时回退到环境变量全局默认。
// ============================================================
export const userSettings = pgTable(
  "user_settings",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 100 }).notNull(),
    value: text("value").notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.key] }),
  })
);

// ============================================================
// 0.6. 用户模型配置表 (user_model_configs)
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
    dailyTokenLimit: integer("daily_token_limit"),
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

// ============================================================
// 4. 运行记录表 (workspace_runs) —— 每次 Agent 多步循环记为一次 Run
// ============================================================
export const runStatusEnum = pgEnum("run_status", [
  "running",
  "completed",
  "error",
]);

export const workspaceRuns = pgTable(
  "workspace_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 255 }).notNull(),
    userPrompt: text("user_prompt").notNull(),
    finalResponse: text("final_response"),
    promptTokens: integer("prompt_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    finishReason: varchar("finish_reason", { length: 50 }),
    modelName: varchar("model_name", { length: 100 }),
    status: runStatusEnum("status").default("completed").notNull(),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_runs_workspace").on(
      table.workspaceId,
      table.createTime.desc()
    ),
    sessionIdx: index("idx_runs_session").on(table.sessionId),
    userIdIdx: index("idx_runs_user_id").on(table.userId),
  })
);

// ============================================================
// 5. 运行步骤表 (run_steps) —— 单次 Run 中每个 streamText step 的记录
// ============================================================
export const stepTypeEnum = pgEnum("step_type", [
  "thought",
  "tool-call",
  "tool-result",
]);

export const runSteps = pgTable(
  "run_steps",
  {
    id: serial("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workspaceRuns.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    stepType: stepTypeEnum("step_type").notNull(),
    thought: text("thought"),
    toolName: varchar("tool_name", { length: 100 }),
    toolArgs: jsonb("tool_args"),
    toolResult: jsonb("tool_result"),
    durationMs: integer("duration_ms"),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    runIdx: index("idx_steps_run").on(table.runId, table.stepNumber),
  })
);

// ============================================================
// 7. 场景定义表 (scene_definitions) —— 场景驱动型智能体配置
// ============================================================
export const sceneDefinitions = pgTable(
  "scene_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }).default("🔧"),
    systemPrompt: text("system_prompt").notNull(),
    toolWhitelist: jsonb("tool_whitelist").default([]),
    requiredInputs: jsonb("required_inputs").default([]),
    dbRequired: boolean("db_required").default(false),
    sortOrder: integer("sort_order").default(0),
    status: varchar("status", { length: 20 }).default("active"),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    statusIdx: index("idx_scenes_status").on(table.status, table.sortOrder),
  })
);

// ============================================================
// 8. 数据库连接配置表 (db_connections) —— 用户 DB 连接存储
// ============================================================
export const dbConnections = pgTable(
  "db_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 200 }).notNull(),
    dbType: varchar("db_type", { length: 50 }).notNull().default("postgresql"),
    host: varchar("host", { length: 255 }).notNull(),
    port: integer("port").notNull(),
    dbName: varchar("db_name", { length: 255 }).notNull(),
    username: varchar("username", { length: 255 }).notNull(),
    passwordEncrypted: text("password_encrypted").notNull(),
    sslMode: varchar("ssl_mode", { length: 50 }).default("prefer"),
    extraArgs: jsonb("extra_args").default({}),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    testResult: varchar("test_result", { length: 20 }),
    testMessage: text("test_message"),
    status: varchar("status", { length: 20 }).default("active"),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_db_conn_user").on(table.userId, table.status),
    uniqueLabel: uniqueIndex("uidx_db_conn_label").on(
      table.userId,
      table.label
    ),
  })
);

// ============================================================
// 6. 工作空间记忆表 (workspace_memories) —— 长期记忆/上下文存储
// ============================================================
export const memoryCategoryEnum = pgEnum("memory_category", [
  "tech-stack",
  "convention",
  "user-pref",
  "fact",
  "general",
]);

export const workspaceMemories = pgTable(
  "workspace_memories",
  {
    id: serial("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 255 }).notNull(),
    content: text("content").notNull(),
    category: memoryCategoryEnum("category").default("general").notNull(),
    importance: integer("importance").default(0),
    sourceRunId: uuid("source_run_id").references(() => workspaceRuns.id, {
      onDelete: "set null",
    }),
    createTime: timestamp("create_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updateTime: timestamp("update_time", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    workspaceIdx: index("idx_memories_workspace").on(table.workspaceId),
    uniqueWorkspaceKey: uniqueIndex("uidx_workspace_memory_key").on(
      table.workspaceId,
      table.key
    ),
  })
);
