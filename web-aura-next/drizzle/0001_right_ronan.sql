CREATE TYPE "public"."workspace_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "user_model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"label" varchar(100) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"base_url" text DEFAULT 'https://api.deepseek.com/v1',
	"is_default" boolean DEFAULT false,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(100),
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"user_id" integer NOT NULL,
	"context_snapshot" jsonb,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "user_model_configs" ADD CONSTRAINT "user_model_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_model_configs_user_id" ON "user_model_configs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_user_label" ON "user_model_configs" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "idx_workspaces_user_id" ON "workspaces" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_knowledge_user_id" ON "agent_knowledge" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_workspace_id" ON "chat_messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_user_id" ON "chat_messages" USING btree ("user_id");