CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'searching', 'accepted', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."delivery_type" AS ENUM('package', 'document', 'food', 'grocery', 'custom');--> statement-breakpoint
ALTER TYPE "public"."payment_type" ADD VALUE 'delivery' BEFORE 'wallet_topup';--> statement-breakpoint
CREATE TABLE "deliveries" (
	"delivery_id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer,
	"rider_id" integer,
	"order_id" integer,
	"delivery_reference" varchar(50) NOT NULL,
	"delivery_type" "delivery_type" DEFAULT 'package',
	"status" "delivery_status" DEFAULT 'pending',
	"pickup_address" varchar(255) NOT NULL,
	"pickup_latitude" numeric(10, 8) NOT NULL,
	"pickup_longitude" numeric(11, 8) NOT NULL,
	"pickup_contact_name" varchar(100),
	"pickup_contact_phone" varchar(20),
	"pickup_instructions" text,
	"dropoff_address" varchar(255) NOT NULL,
	"dropoff_latitude" numeric(10, 8) NOT NULL,
	"dropoff_longitude" numeric(11, 8) NOT NULL,
	"recipient_name" varchar(100) NOT NULL,
	"recipient_phone" varchar(20) NOT NULL,
	"dropoff_instructions" text,
	"package_weight_kg" numeric(5, 2),
	"is_fragile" boolean DEFAULT false,
	"delivery_pin" varchar(6),
	"proof_of_delivery_image" varchar(255),
	"distance_km" numeric(10, 2),
	"delivery_fee" numeric(10, 2) NOT NULL,
	"tip_amount" numeric(10, 2) DEFAULT '0.00',
	"total_amount" numeric(10, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending',
	"scheduled_time" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "deliveries_delivery_reference_unique" UNIQUE("delivery_reference")
);
--> statement-breakpoint
CREATE TABLE "delivery_items" (
	"item_id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"item_name" varchar(100) NOT NULL,
	"quantity" integer DEFAULT 1,
	"estimated_value" numeric(10, 2),
	"description" text
);
--> statement-breakpoint
ALTER TABLE "rider_earnings" ADD COLUMN "delivery_id" integer;--> statement-breakpoint
ALTER TABLE "rider_rejections" ADD COLUMN "delivery_id" integer;--> statement-breakpoint
ALTER TABLE "used_promotions" ADD COLUMN "delivery_id" integer;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD COLUMN "delivery_id" integer;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_sender_id_users_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_recipient_id_users_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_deliveries_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_sender_idx" ON "deliveries" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "deliveries_rider_idx" ON "deliveries" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "deliveries_status_idx" ON "deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deliveries_reference_idx" ON "deliveries" USING btree ("delivery_reference");--> statement-breakpoint
CREATE INDEX "delivery_items_delivery_idx" ON "delivery_items" USING btree ("delivery_id");--> statement-breakpoint
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_delivery_id_deliveries_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_rejections" ADD CONSTRAINT "rider_rejections_delivery_id_deliveries_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_promotions" ADD CONSTRAINT "used_promotions_delivery_id_deliveries_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_delivery_id_deliveries_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("delivery_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "earnings_delivery_idx" ON "rider_earnings" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "rejections_delivery_idx" ON "rider_rejections" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "used_promotions_delivery_idx" ON "used_promotions" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "transactions_delivery_idx" ON "wallet_transactions" USING btree ("delivery_id");