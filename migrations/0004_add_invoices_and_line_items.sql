-- Migration: Add invoices and invoice_line_items tables for MVP job-cost tracking
-- This enables tracking of invoice totals AND individual line items with categorization

-- Add external_ref to projects for job name / PO matching
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "external_ref" TEXT;

-- Create invoices table (invoice header data)
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" VARCHAR NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "project_id" VARCHAR REFERENCES "projects"("id") ON DELETE SET NULL,
  "vendor_id" VARCHAR REFERENCES "vendors"("id") ON DELETE SET NULL,
  "vendor" TEXT,  -- Original vendor name from OCR
  "invoice_number" TEXT,
  "invoice_date" DATE,
  "due_date" DATE,
  "customer_po" TEXT,  -- For project matching
  "job_name" TEXT,  -- For project matching
  "subtotal" NUMERIC(12, 2),
  "tax" NUMERIC(12, 2),
  "shipping" NUMERIC(12, 2),
  "total" NUMERIC(12, 2) NOT NULL,
  -- Confidence & extraction metadata
  "total_confidence" NUMERIC(5, 2),
  "vendor_confidence" NUMERIC(5, 2),
  "extraction_method" TEXT DEFAULT 'deterministic',  -- deterministic | llm_fallback
  -- Source tracking
  "source_job_id" VARCHAR REFERENCES "ingestion_jobs"("id") ON DELETE SET NULL,
  "source_ref" TEXT,  -- e.g., s3://bucket/key
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create invoice_line_items table (individual line items with categorization)
CREATE TABLE IF NOT EXISTS "invoice_line_items" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id" VARCHAR NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "company_id" VARCHAR NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "product_code" TEXT,
  "description" TEXT NOT NULL,
  "quantity" NUMERIC(12, 4),
  "unit" TEXT,  -- EA, FT, BOX, etc.
  "unit_price" NUMERIC(12, 4),
  "line_amount" NUMERIC(12, 2),
  -- Categorization
  "category" TEXT,  -- drywall, framing, concrete, paint, electrical, plumbing, hvac, tools, misc
  "category_confidence" NUMERIC(5, 2),
  "category_reason" TEXT,  -- keyword matched, LLM, manual
  -- Raw extraction data
  "raw_line" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_invoices_company_id" ON "invoices"("company_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_project_id" ON "invoices"("project_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_vendor_id" ON "invoices"("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_source_job_id" ON "invoices"("source_job_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_invoice_date" ON "invoices"("invoice_date");

CREATE INDEX IF NOT EXISTS "idx_invoice_line_items_invoice_id" ON "invoice_line_items"("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_invoice_line_items_company_id" ON "invoice_line_items"("company_id");
CREATE INDEX IF NOT EXISTS "idx_invoice_line_items_category" ON "invoice_line_items"("category");

-- Update labor_entries to add amount column if not exists (for direct payroll import)
ALTER TABLE "labor_entries" ADD COLUMN IF NOT EXISTS "amount" NUMERIC(12, 2);
