ALTER TABLE "vocab_sets" ADD COLUMN "category" varchar(128);--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "ipa_v1" varchar(128);--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "ipa_v2" varchar(128);--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "ipa_v3" varchar(128);