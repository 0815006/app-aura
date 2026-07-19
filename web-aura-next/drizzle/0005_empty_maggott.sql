CREATE TABLE "user_settings" (
	"user_id" integer NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;