ALTER TABLE "deliveries" RENAME COLUMN "recipient_id" TO "recipient";--> statement-breakpoint
ALTER TABLE "deliveries" DROP CONSTRAINT "deliveries_recipient_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "number" varchar(50) NOT NULL;