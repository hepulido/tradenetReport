-- Migration: Add invoice deduplication
-- Run this manually: psql -d tradenet -f migrations/0003_invoice_dedupe.sql

-- ========== STEP 1: Identify duplicates ==========
-- Preview duplicates before cleanup
SELECT
  company_id,
  invoice_number,
  invoice_date,
  total,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY created_at DESC) as invoice_ids
FROM invoices
WHERE invoice_number IS NOT NULL
GROUP BY company_id, invoice_number, invoice_date, total
HAVING COUNT(*) > 1;

-- ========== STEP 2: Delete older duplicate invoices ==========
-- Keep the newest invoice (by created_at) for each dedupe key
-- Line items will cascade delete due to FK constraint

BEGIN;

-- Delete older duplicates (keeps newest)
DELETE FROM invoices
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY company_id, invoice_number, invoice_date, total
        ORDER BY created_at DESC
      ) as rn
    FROM invoices
    WHERE invoice_number IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Verify no duplicates remain
SELECT
  company_id,
  invoice_number,
  invoice_date,
  total,
  COUNT(*) as cnt
FROM invoices
WHERE invoice_number IS NOT NULL
GROUP BY company_id, invoice_number, invoice_date, total
HAVING COUNT(*) > 1;
-- Should return 0 rows

COMMIT;

-- ========== STEP 3: Add unique constraint ==========
-- This prevents future duplicates at the DB level
-- Note: NULL invoice_number values are allowed to have duplicates (NULL != NULL in SQL)

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_dedupe_key
ON invoices (company_id, invoice_number, invoice_date, total)
WHERE invoice_number IS NOT NULL;

-- Verify index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'invoices' AND indexname = 'idx_invoices_dedupe_key';

-- ========== DONE ==========
-- The unique partial index allows:
-- - Only one invoice per (company_id, invoice_number, invoice_date, total) when invoice_number is NOT NULL
-- - Multiple invoices with NULL invoice_number (edge case for incomplete data)
