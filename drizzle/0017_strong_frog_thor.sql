UPDATE "users" SET "full_name" = NULL WHERE "full_name" = 'not set yet';--> statement-breakpoint
UPDATE "users" SET "phone_number" = NULL WHERE "phone_number" = 'not set yet';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "full_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone_number" DROP DEFAULT;