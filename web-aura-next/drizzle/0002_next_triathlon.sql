CREATE TYPE "public"."memory_category" AS ENUM('tech-stack', 'convention', 'user-pref', 'fact', 'general');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('thought', 'tool-call', 'tool-result');--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"step_type" "step_type" NOT NULL,
	"thought" text,
	"tool_name" varchar(100),
	"tool_args" jsonb,
	"tool_result" jsonb,
	"duration_ms" integer,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"category" "memory_category" DEFAULT 'general' NOT NULL,
	"importance" integer DEFAULT 0,
	"source_run_id" uuid,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"user_prompt" text NOT NULL,
	"final_response" text,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"finish_reason" varchar(50),
	"model_name" varchar(100),
	"status" "run_status" DEFAULT 'completed' NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_workspace_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workspace_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memories" ADD CONSTRAINT "workspace_memories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memories" ADD CONSTRAINT "workspace_memories_source_run_id_workspace_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."workspace_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_runs" ADD CONSTRAINT "workspace_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_runs" ADD CONSTRAINT "workspace_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_steps_run" ON "run_steps" USING btree ("run_id","step_number");--> statement-breakpoint
CREATE INDEX "idx_memories_workspace" ON "workspace_memories" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_workspace_memory_key" ON "workspace_memories" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "idx_runs_workspace" ON "workspace_runs" USING btree ("workspace_id","create_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_runs_session" ON "workspace_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_runs_user_id" ON "workspace_runs" USING btree ("user_id");