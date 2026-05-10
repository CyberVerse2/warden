ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "email" = NULL WHERE "email" = '';
