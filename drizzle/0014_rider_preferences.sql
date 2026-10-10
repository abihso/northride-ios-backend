CREATE TABLE "rider_preferences" (
	"preference_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"receive_ride_offers" boolean DEFAULT true NOT NULL,
	"receive_delivery_offers" boolean DEFAULT true NOT NULL,
	"receive_ride_updates" boolean DEFAULT true NOT NULL,
	"receive_delivery_updates" boolean DEFAULT true NOT NULL,
	"receive_payment_updates" boolean DEFAULT true NOT NULL,
	"receive_account_updates" boolean DEFAULT true NOT NULL,
	"preferred_contact_method" varchar(20) DEFAULT 'email' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "rider_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "rider_preferences" ADD CONSTRAINT "rider_preferences_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;