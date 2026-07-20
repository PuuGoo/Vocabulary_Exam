ALTER TABLE "assignment_extensions" ALTER COLUMN "due_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_extensions" ADD COLUMN "excused" boolean DEFAULT false NOT NULL;