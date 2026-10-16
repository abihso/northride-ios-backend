ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_subject" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facebook_subject" varchar(255);--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND conname = 'users_google_subject_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_google_subject_unique" UNIQUE("google_subject");
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND conname = 'users_facebook_subject_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_facebook_subject_unique" UNIQUE("facebook_subject");
  END IF;
END $$;
