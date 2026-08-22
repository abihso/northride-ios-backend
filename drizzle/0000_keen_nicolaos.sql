CREATE TYPE "public"."address_type" AS ENUM('home', 'work', 'other');--> statement-breakpoint
CREATE TYPE "public"."applicable_to" AS ENUM('delivery', 'ride', 'both');--> statement-breakpoint
CREATE TYPE "public"."booking_type" AS ENUM('now', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."earning_type" AS ENUM('delivery', 'ride', 'bonus');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'accepted', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order', 'payment', 'delivery', 'ride', 'system', 'promotion');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('delivery', 'pickup', 'ride');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'wallet', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('order', 'ride', 'wallet_topup', 'withdrawal');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('pending', 'searching', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."ride_type" AS ENUM('standard', 'premium', 'shared', 'luxury');--> statement-breakpoint
CREATE TYPE "public"."support_category" AS ENUM('order', 'payment', 'delivery', 'ride', 'account', 'other');--> statement-breakpoint
CREATE TYPE "public"."support_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('customer', 'rider', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('bicycle', 'motorcycle', 'car', 'scooter', 'van', 'truck');--> statement-breakpoint
CREATE TYPE "public"."wallet_transaction_type" AS ENUM('deposit', 'withdrawal', 'payment', 'refund', 'bonus', 'ride_payment');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"log_id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"action_type" varchar(50) NOT NULL,
	"action_description" text,
	"target_table" varchar(50),
	"target_id" integer,
	"old_values" text,
	"new_values" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"notification_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"type" "notification_type" DEFAULT 'system',
	"is_read" boolean DEFAULT false,
	"is_clicked" boolean DEFAULT false,
	"reference_id" integer,
	"reference_type" varchar(50),
	"created_at" timestamp with time zone DEFAULT now(),
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"order_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"rider_id" integer,
	"order_reference" varchar(50) NOT NULL,
	"order_type" "order_type" DEFAULT 'delivery',
	"status" "order_status" DEFAULT 'pending',
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending',
	"subtotal" numeric(10, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0.00',
	"service_charge" numeric(10, 2) DEFAULT '0.00',
	"total_amount" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0.00',
	"tip_amount" numeric(10, 2) DEFAULT '0.00',
	"delivery_address" varchar(255),
	"delivery_latitude" numeric(10, 8),
	"delivery_longitude" numeric(11, 8),
	"delivery_instructions" text,
	"pickup_latitude" numeric(10, 8),
	"pickup_longitude" numeric(11, 8),
	"estimated_delivery_time" integer,
	"actual_delivery_time" integer,
	"order_placed_at" timestamp with time zone DEFAULT now(),
	"confirmed_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"in_transit_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"rejection_reason" text,
	"customer_rating" integer,
	"customer_review" text,
	"rider_rating" integer,
	"rider_review" text,
	"ride_id" integer,
	CONSTRAINT "orders_order_reference_unique" UNIQUE("order_reference")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"product_id" serial PRIMARY KEY NOT NULL,
	"shop_id" integer NOT NULL,
	"product_name" varchar(100) NOT NULL,
	"product_description" text,
	"category" varchar(50),
	"price" numeric(10, 2) NOT NULL,
	"discount_price" numeric(10, 2),
	"stock_quantity" integer DEFAULT 0,
	"unit" varchar(20) DEFAULT 'piece',
	"image_url" varchar(255),
	"is_available" boolean DEFAULT true,
	"is_featured" boolean DEFAULT false,
	"preparation_time" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"promotion_id" serial PRIMARY KEY NOT NULL,
	"shop_id" integer,
	"promo_code" varchar(50) NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"minimum_order_amount" numeric(10, 2),
	"maximum_discount" numeric(10, 2),
	"applicable_to" "applicable_to" DEFAULT 'both',
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "promotions_promo_code_unique" UNIQUE("promo_code")
);
--> statement-breakpoint
CREATE TABLE "ride_analytics" (
	"analytics_id" serial PRIMARY KEY NOT NULL,
	"ride_id" integer NOT NULL,
	"rider_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"booking_to_arrival_time" integer,
	"arrival_to_start_time" integer,
	"start_to_completion_time" integer,
	"total_trip_time" integer,
	"distance_traveled" numeric(10, 2),
	"average_speed" numeric(5, 2),
	"idle_time" integer,
	"route_efficiency" numeric(5, 2),
	"data_usage_mb" numeric(10, 2),
	"battery_usage_percentage" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ride_booking_waypoints" (
	"waypoint_id" serial PRIMARY KEY NOT NULL,
	"ride_id" integer NOT NULL,
	"stop_order" integer NOT NULL,
	"address" varchar(255) NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"instructions" text,
	"estimated_arrival_time" timestamp with time zone,
	"actual_arrival_time" timestamp with time zone,
	"duration_at_stop" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "ride_bookings" (
	"ride_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"rider_id" integer,
	"ride_reference" varchar(50) NOT NULL,
	"ride_type" "ride_type" DEFAULT 'standard',
	"booking_type" "booking_type" DEFAULT 'now',
	"pickup_address" varchar(255) NOT NULL,
	"pickup_latitude" numeric(10, 8) NOT NULL,
	"pickup_longitude" numeric(11, 8) NOT NULL,
	"pickup_instructions" text,
	"pickup_landmark" varchar(100),
	"dropoff_address" varchar(255) NOT NULL,
	"dropoff_latitude" numeric(10, 8) NOT NULL,
	"dropoff_longitude" numeric(11, 8) NOT NULL,
	"dropoff_instructions" text,
	"dropoff_landmark" varchar(100),
	"estimated_distance" numeric(10, 2),
	"estimated_duration" integer,
	"estimated_price" numeric(10, 2),
	"actual_price" numeric(10, 2),
	"surge_multiplier" numeric(3, 2) DEFAULT '1.00',
	"base_fare" numeric(10, 2) DEFAULT '0.00',
	"distance_fare" numeric(10, 2) DEFAULT '0.00',
	"time_fare" numeric(10, 2) DEFAULT '0.00',
	"toll_charges" numeric(10, 2) DEFAULT '0.00',
	"waiting_charges" numeric(10, 2) DEFAULT '0.00',
	"cancellation_fee" numeric(10, 2) DEFAULT '0.00',
	"number_of_passengers" integer DEFAULT 1,
	"has_luggage" boolean DEFAULT false,
	"has_pets" boolean DEFAULT false,
	"requires_wheelchair" boolean DEFAULT false,
	"special_requirements" text,
	"status" "ride_status" DEFAULT 'pending',
	"cancellation_reason" text,
	"cancelled_by" varchar(20),
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending',
	"payment_reference" varchar(100),
	"booked_at" timestamp with time zone DEFAULT now(),
	"scheduled_time" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"rider_arrived_at" timestamp with time zone,
	"ride_started_at" timestamp with time zone,
	"ride_completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"rider_rating" integer,
	"rider_review" text,
	"passenger_rating" integer,
	"passenger_review" text,
	"route_polyline" text,
	"actual_distance" numeric(10, 2),
	"actual_duration" integer,
	CONSTRAINT "ride_bookings_ride_reference_unique" UNIQUE("ride_reference")
);
--> statement-breakpoint
CREATE TABLE "ride_fare_breakdown" (
	"breakdown_id" serial PRIMARY KEY NOT NULL,
	"ride_id" integer NOT NULL,
	"base_fare" numeric(10, 2),
	"distance_fare" numeric(10, 2),
	"time_fare" numeric(10, 2),
	"surge_fee" numeric(10, 2),
	"toll_charges" numeric(10, 2),
	"waiting_charges" numeric(10, 2),
	"luggage_fee" numeric(10, 2),
	"pets_fee" numeric(10, 2),
	"discount_amount" numeric(10, 2),
	"promo_code" varchar(50),
	"total_fare" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ride_pricing" (
	"pricing_id" serial PRIMARY KEY NOT NULL,
	"ride_type" "ride_type" NOT NULL,
	"vehicle_type" varchar(20),
	"base_fare" numeric(10, 2) NOT NULL,
	"price_per_km" numeric(10, 2) NOT NULL,
	"price_per_minute" numeric(10, 2) NOT NULL,
	"minimum_fare" numeric(10, 2) NOT NULL,
	"cancellation_fee" numeric(10, 2) DEFAULT '0.00',
	"waiting_fee_per_minute" numeric(10, 2) DEFAULT '0.00',
	"surge_multiplier_min" numeric(3, 2) DEFAULT '1.00',
	"surge_multiplier_max" numeric(3, 2) DEFAULT '3.00',
	"is_active" boolean DEFAULT true,
	"effective_from" timestamp with time zone DEFAULT now(),
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ride_share_matches" (
	"match_id" serial PRIMARY KEY NOT NULL,
	"primary_ride_id" integer NOT NULL,
	"secondary_ride_id" integer NOT NULL,
	"rider_id" integer NOT NULL,
	"match_status" "match_status" DEFAULT 'pending',
	"match_score" numeric(5, 2),
	"matched_at" timestamp with time zone DEFAULT now(),
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rider_earnings" (
	"earning_id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"order_id" integer,
	"ride_id" integer,
	"delivery_fee" numeric(10, 2) DEFAULT '0.00',
	"ride_fare" numeric(10, 2) DEFAULT '0.00',
	"tip_amount" numeric(10, 2) DEFAULT '0.00',
	"bonus_amount" numeric(10, 2) DEFAULT '0.00',
	"total_earned" numeric(10, 2) NOT NULL,
	"earning_type" "earning_type" DEFAULT 'delivery',
	"status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now(),
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rider_locations" (
	"location_id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"accuracy" numeric(10, 2),
	"speed" numeric(10, 2),
	"heading" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rider_rejections" (
	"rejection_id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"ride_id" integer,
	"rider_id" integer NOT NULL,
	"reason" text,
	"rejected_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rider_schedules" (
	"schedule_id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_available" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "schedules_unique_rider_day" UNIQUE("rider_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "riders" (
	"rider_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"vehicle_plate_number" varchar(20),
	"vehicle_model" varchar(50),
	"vehicle_color" varchar(30),
	"license_number" varchar(50),
	"is_available" boolean DEFAULT true,
	"is_approved" boolean DEFAULT false,
	"current_latitude" numeric(10, 8),
	"current_longitude" numeric(11, 8),
	"rating" numeric(3, 2) DEFAULT '0.00',
	"total_deliveries" integer DEFAULT 0,
	"total_rides" integer DEFAULT 0,
	"earning_balance" numeric(10, 2) DEFAULT '0.00',
	"bank_account_name" varchar(100),
	"bank_account_number" varchar(50),
	"bank_name" varchar(50),
	"id_card_image" varchar(255),
	"driver_license_image" varchar(255),
	"vehicle_registration_image" varchar(255),
	"insurance_image" varchar(255),
	"max_passengers" integer DEFAULT 1,
	"has_air_conditioning" boolean DEFAULT false,
	"has_wifi" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "riders_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"shop_id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"shop_name" varchar(100) NOT NULL,
	"shop_description" text,
	"shop_category" varchar(50),
	"address" varchar(255) NOT NULL,
	"city" varchar(50),
	"state" varchar(50),
	"country" varchar(50),
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"phone_number" varchar(20),
	"email" varchar(100),
	"logo" varchar(255),
	"cover_image" varchar(255),
	"is_open" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"rating" numeric(3, 2) DEFAULT '0.00',
	"opening_time" timestamp with time zone,
	"closing_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"ticket_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subject" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"category" "support_category" DEFAULT 'other',
	"priority" "priority" DEFAULT 'medium',
	"status" "support_status" DEFAULT 'open',
	"assigned_to" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "surge_pricing_log" (
	"surge_id" serial PRIMARY KEY NOT NULL,
	"ride_type" "ride_type" NOT NULL,
	"area_latitude" numeric(10, 8),
	"area_longitude" numeric(11, 8),
	"radius_km" numeric(5, 2),
	"multiplier" numeric(3, 2) NOT NULL,
	"rider_demand" integer,
	"available_riders" integer,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"config_id" serial PRIMARY KEY NOT NULL,
	"config_key" varchar(50) NOT NULL,
	"config_value" text,
	"config_group" varchar(50),
	"description" text,
	"is_editable" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "system_config_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "used_promotions" (
	"used_promo_id" serial PRIMARY KEY NOT NULL,
	"promotion_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" integer,
	"ride_id" integer,
	"discount_amount" numeric(10, 2) NOT NULL,
	"used_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"address_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"address_label" varchar(50) DEFAULT 'Home',
	"address_line1" varchar(255) NOT NULL,
	"address_line2" varchar(255),
	"city" varchar(50),
	"state" varchar(50),
	"country" varchar(50),
	"postal_code" varchar(20),
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"phone_number" varchar(20),
	"is_default" boolean DEFAULT false,
	"address_type" "address_type" DEFAULT 'home',
	"delivery_instructions" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(100) DEFAULT 'not set yet',
	"email" varchar(100) NOT NULL,
	"phone_number" varchar(20) DEFAULT 'not set yet',
	"password_hash" varchar(255) NOT NULL,
	"profile_picture" varchar(255),
	"user_type" "user_type" DEFAULT 'customer',
	"is_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_login" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"transaction_id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"transaction_type" "wallet_transaction_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"description" text,
	"reference" varchar(100),
	"order_id" integer,
	"ride_id" integer,
	"status" varchar(20) DEFAULT 'completed',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wallet_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"wallet_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"balance" numeric(10, 2) DEFAULT '0.00',
	"total_deposits" numeric(10, 2) DEFAULT '0.00',
	"total_withdrawals" numeric(10, 2) DEFAULT '0.00',
	"last_transaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_users_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_analytics" ADD CONSTRAINT "ride_analytics_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_analytics" ADD CONSTRAINT "ride_analytics_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_analytics" ADD CONSTRAINT "ride_analytics_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_booking_waypoints" ADD CONSTRAINT "ride_booking_waypoints_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_fare_breakdown" ADD CONSTRAINT "ride_fare_breakdown_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_share_matches" ADD CONSTRAINT "ride_share_matches_primary_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("primary_ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_share_matches" ADD CONSTRAINT "ride_share_matches_secondary_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("secondary_ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_share_matches" ADD CONSTRAINT "ride_share_matches_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_locations" ADD CONSTRAINT "rider_locations_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_rejections" ADD CONSTRAINT "rider_rejections_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_rejections" ADD CONSTRAINT "rider_rejections_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_rejections" ADD CONSTRAINT "rider_rejections_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_schedules" ADD CONSTRAINT "rider_schedules_rider_id_riders_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("rider_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riders" ADD CONSTRAINT "riders_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_users_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_promotions" ADD CONSTRAINT "used_promotions_promotion_id_promotions_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("promotion_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_promotions" ADD CONSTRAINT "used_promotions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_promotions" ADD CONSTRAINT "used_promotions_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "used_promotions" ADD CONSTRAINT "used_promotions_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("wallet_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_ride_id_ride_bookings_ride_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."ride_bookings"("ride_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_admin_idx" ON "audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "audit_date_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_reference_idx" ON "notifications" USING btree ("reference_id","reference_type");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_shop_idx" ON "orders" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "orders_rider_idx" ON "orders" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_reference_idx" ON "orders" USING btree ("order_reference");--> statement-breakpoint
CREATE INDEX "orders_date_idx" ON "orders" USING btree ("order_placed_at");--> statement-breakpoint
CREATE INDEX "orders_ride_idx" ON "orders" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "products_shop_idx" ON "products" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "products_availability_idx" ON "products" USING btree ("is_available");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "promotions_code_idx" ON "promotions" USING btree ("promo_code");--> statement-breakpoint
CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "promotions_date_idx" ON "promotions" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "analytics_ride_idx" ON "ride_analytics" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "analytics_rider_idx" ON "ride_analytics" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "analytics_user_idx" ON "ride_analytics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "waypoints_ride_idx" ON "ride_booking_waypoints" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "waypoints_stop_order_idx" ON "ride_booking_waypoints" USING btree ("stop_order");--> statement-breakpoint
CREATE INDEX "bookings_user_idx" ON "ride_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookings_rider_idx" ON "ride_bookings" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "ride_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_reference_idx" ON "ride_bookings" USING btree ("ride_reference");--> statement-breakpoint
CREATE INDEX "bookings_booking_type_idx" ON "ride_bookings" USING btree ("booking_type");--> statement-breakpoint
CREATE INDEX "bookings_scheduled_idx" ON "ride_bookings" USING btree ("scheduled_time");--> statement-breakpoint
CREATE INDEX "bookings_location_idx" ON "ride_bookings" USING btree ("pickup_latitude","pickup_longitude","dropoff_latitude","dropoff_longitude");--> statement-breakpoint
CREATE INDEX "bookings_date_idx" ON "ride_bookings" USING btree ("booked_at");--> statement-breakpoint
CREATE INDEX "breakdown_ride_idx" ON "ride_fare_breakdown" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "pricing_ride_type_idx" ON "ride_pricing" USING btree ("ride_type");--> statement-breakpoint
CREATE INDEX "pricing_active_idx" ON "ride_pricing" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "pricing_effective_idx" ON "ride_pricing" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "matches_primary_idx" ON "ride_share_matches" USING btree ("primary_ride_id");--> statement-breakpoint
CREATE INDEX "matches_secondary_idx" ON "ride_share_matches" USING btree ("secondary_ride_id");--> statement-breakpoint
CREATE INDEX "matches_rider_idx" ON "ride_share_matches" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "ride_share_matches" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "earnings_rider_idx" ON "rider_earnings" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "earnings_order_idx" ON "rider_earnings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "earnings_ride_idx" ON "rider_earnings" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "earnings_status_idx" ON "rider_earnings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "earnings_type_idx" ON "rider_earnings" USING btree ("earning_type");--> statement-breakpoint
CREATE INDEX "locations_rider_idx" ON "rider_locations" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "locations_date_idx" ON "rider_locations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rejections_order_idx" ON "rider_rejections" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "rejections_ride_idx" ON "rider_rejections" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "rejections_rider_idx" ON "rider_rejections" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "schedules_rider_idx" ON "rider_schedules" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "schedules_day_idx" ON "rider_schedules" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "riders_availability_idx" ON "riders" USING btree ("is_available");--> statement-breakpoint
CREATE INDEX "riders_location_idx" ON "riders" USING btree ("current_latitude","current_longitude");--> statement-breakpoint
CREATE INDEX "riders_approved_idx" ON "riders" USING btree ("is_approved");--> statement-breakpoint
CREATE INDEX "riders_vehicle_type_idx" ON "riders" USING btree ("vehicle_type");--> statement-breakpoint
CREATE INDEX "shops_location_idx" ON "shops" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "shops_open_status_idx" ON "shops" USING btree ("is_open");--> statement-breakpoint
CREATE INDEX "shops_verified_idx" ON "shops" USING btree ("is_verified");--> statement-breakpoint
CREATE INDEX "tickets_user_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_assigned_idx" ON "support_tickets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "tickets_category_idx" ON "support_tickets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "surge_area_idx" ON "surge_pricing_log" USING btree ("area_latitude","area_longitude");--> statement-breakpoint
CREATE INDEX "surge_active_idx" ON "surge_pricing_log" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "surge_ride_type_idx" ON "surge_pricing_log" USING btree ("ride_type");--> statement-breakpoint
CREATE INDEX "config_key_idx" ON "system_config" USING btree ("config_key");--> statement-breakpoint
CREATE INDEX "config_group_idx" ON "system_config" USING btree ("config_group");--> statement-breakpoint
CREATE INDEX "used_promotions_promo_idx" ON "used_promotions" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "used_promotions_user_idx" ON "used_promotions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "used_promotions_order_idx" ON "used_promotions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "used_promotions_ride_idx" ON "used_promotions" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "addresses_default_idx" ON "user_addresses" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "addresses_type_idx" ON "user_addresses" USING btree ("address_type");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "users_user_type_idx" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "transactions_wallet_idx" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "transactions_user_idx" ON "wallet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_reference_idx" ON "wallet_transactions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "transactions_order_idx" ON "wallet_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "transactions_ride_idx" ON "wallet_transactions" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");