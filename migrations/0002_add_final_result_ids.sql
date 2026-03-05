-- STEP 1: Add final result ID columns to ingestion_jobs
-- These columns store canonical pointers to the final categorized/parsed results

ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "final_categorized_result_id" varchar;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "final_parsed_result_id" varchar;
