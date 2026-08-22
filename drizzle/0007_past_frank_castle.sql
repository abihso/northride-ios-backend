ALTER TABLE "deliveries" ALTER COLUMN "delivery_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "deliveries" ALTER COLUMN "delivery_type" SET DEFAULT 'send'::text;--> statement-breakpoint
DROP TYPE "public"."delivery_type";--> statement-breakpoint
CREATE TYPE "public"."delivery_type" AS ENUM('send', 'receive');--> statement-breakpoint
ALTER TABLE "deliveries" ALTER COLUMN "delivery_type" SET DEFAULT 'send'::"public"."delivery_type";--> statement-breakpoint
ALTER TABLE "deliveries" ALTER COLUMN "delivery_type" SET DATA TYPE "public"."delivery_type" USING "delivery_type"::"public"."delivery_type";