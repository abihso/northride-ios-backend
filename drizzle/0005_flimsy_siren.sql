CREATE TABLE "User_system_config" (
	"config_id" serial PRIMARY KEY NOT NULL,
	"config_key" varchar(50) NOT NULL,
	"config_value" text,
	"is_editable" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "User_system_config_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE INDEX "user_config_key_idx" ON "User_system_config" USING btree ("config_key");