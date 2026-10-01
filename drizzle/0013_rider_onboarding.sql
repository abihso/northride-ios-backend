ALTER TABLE "users" ADD COLUMN "rider_onboarding_completed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "users"
SET "rider_onboarding_completed" = true
WHERE "user_type" = 'rider'
  AND EXISTS (
    SELECT 1 FROM "riders"
    WHERE "riders"."user_id" = "users"."user_id"
      AND "riders"."is_approved" = true
  );
