CREATE TABLE "db_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"label" varchar(200) NOT NULL,
	"db_type" varchar(50) DEFAULT 'postgresql' NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer NOT NULL,
	"db_name" varchar(255) NOT NULL,
	"username" varchar(255) NOT NULL,
	"password_encrypted" text NOT NULL,
	"ssl_mode" varchar(50) DEFAULT 'prefer',
	"extra_args" jsonb DEFAULT '{}'::jsonb,
	"last_tested_at" timestamp with time zone,
	"test_result" varchar(20),
	"test_message" text,
	"status" varchar(20) DEFAULT 'active',
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT '🔧',
	"system_prompt" text NOT NULL,
	"tool_whitelist" jsonb DEFAULT '[]'::jsonb,
	"required_inputs" jsonb DEFAULT '[]'::jsonb,
	"db_required" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active',
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_definitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "db_connections" ADD CONSTRAINT "db_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_db_conn_user" ON "db_connections" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_db_conn_label" ON "db_connections" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "idx_scenes_status" ON "scene_definitions" USING btree ("status","sort_order");