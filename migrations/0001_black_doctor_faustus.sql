ALTER TABLE "ingestion_jobs" ALTER COLUMN "id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ALTER COLUMN "company_id" SET DATA TYPE varchar;