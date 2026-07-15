-- ============================================================
-- Aura: 权限控制与隔离 Schema 升级 (Phase 1)
-- 迁移 ID: 0001
-- 说明: 新增 users / user_model_configs，已有表增加 user_id
-- ============================================================

-- 0. 创建枚举类型（首次迁移）
DO $$ BEGIN
	CREATE TYPE "workspace_status" AS ENUM('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. 先创建 users 表（其他表的 FK 依赖此表）
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(100),
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);

-- 2. 创建 user_model_configs 表
CREATE TABLE IF NOT EXISTS "user_model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"label" varchar(100) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"base_url" text DEFAULT 'https://api.deepseek.com/v1',
	"is_default" boolean DEFAULT false,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_model_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

-- 3. 重建 workspaces 表（因新增 user_id NOT NULL，先备份后重建）
-- 检查旧 workspaces 是否存在，存在则删除
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces' AND table_schema = 'public') THEN
		-- 旧表无 user_id 列，且新结构要求 NOT NULL，无法直接迁移，故删除旧表
		DROP TABLE IF EXISTS "workspaces" CASCADE;
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"user_id" integer NOT NULL,
	"context_snapshot" jsonb,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

-- 4. 升级 chat_messages（增加 user_id NOT NULL + workspace_id）
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'user_id') THEN
		ALTER TABLE "chat_messages" ADD COLUMN "user_id" integer;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'workspace_id') THEN
		ALTER TABLE "chat_messages" ADD COLUMN "workspace_id" uuid;
	END IF;
END $$;

-- 清空已有聊天记录（无 user_id 时无法保留）
DELETE FROM "chat_messages" WHERE "user_id" IS NULL;

-- 设 NOT NULL + FK
ALTER TABLE "chat_messages" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- 5. 升级 agent_knowledge（增加 user_id NOT NULL）
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_knowledge' AND column_name = 'user_id') THEN
		ALTER TABLE "agent_knowledge" ADD COLUMN "user_id" integer;
	END IF;
END $$;

DELETE FROM "agent_knowledge" WHERE "user_id" IS NULL;

ALTER TABLE "agent_knowledge" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- 6. 索引
CREATE INDEX IF NOT EXISTS "idx_user_model_configs_user_id" ON "user_model_configs" USING btree ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_user_label" ON "user_model_configs" USING btree ("user_id","label");
CREATE INDEX IF NOT EXISTS "idx_workspaces_user_id" ON "workspaces" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_agent_knowledge_user_id" ON "agent_knowledge" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_workspace_id" ON "chat_messages" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_user_id" ON "chat_messages" USING btree ("user_id");
