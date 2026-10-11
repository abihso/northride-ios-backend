CREATE TYPE "home_content_type" AS ENUM ('promotion', 'suggestion');--> statement-breakpoint
CREATE TABLE "home_page_content" (
	"home_content_id" serial PRIMARY KEY NOT NULL,
	"content_type" "home_content_type" NOT NULL,
	"title" varchar(100) NOT NULL,
	"image_url" varchar(2048) NOT NULL,
	"distance" varchar(50),
	"location" varchar(150),
	"rating" numeric(3, 2),
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "home_page_content_type_idx" ON "home_page_content" USING btree ("content_type","is_active");--> statement-breakpoint
CREATE INDEX "home_page_content_order_idx" ON "home_page_content" USING btree ("display_order","created_at");
