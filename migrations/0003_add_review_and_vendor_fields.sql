-- Migration: Add review queue fields to ingestion_jobs and normalized_name to vendors
-- Run with: psql -d your_database -f migrations/0003_add_review_and_vendor_fields.sql

-- Review queue fields on ingestion_jobs
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "needs_review" boolean DEFAULT false;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "review_reason" text;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "review_status" text DEFAULT 'pending';
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "override_total" numeric(12, 2);
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "override_vendor_name" text;

-- Normalized vendor name for deduplication
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "normalized_name" text;

-- Update existing vendors to have normalized_name (lowercase, trimmed, collapsed whitespace)
UPDATE "vendors" SET "normalized_name" = lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) WHERE "normalized_name" IS NULL;

-- Add unique constraint for vendor deduplication per company
-- Note: This may fail if duplicates exist; clean them up first if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_company_normalized_unique'
  ) THEN
    ALTER TABLE "vendors" ADD CONSTRAINT "vendors_company_normalized_unique" UNIQUE ("company_id", "normalized_name");
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not add unique constraint - duplicates may exist';
END $$;

-- Index for review queue queries
CREATE INDEX IF NOT EXISTS "idx_ingestion_jobs_review" ON "ingestion_jobs" ("company_id", "needs_review", "review_status");
