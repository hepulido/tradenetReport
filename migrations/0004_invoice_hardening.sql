-- Migration: Invoice Persistence Hardening
-- Run: psql -d tradenet -f migrations/0004_invoice_hardening.sql

BEGIN;

-- ========== 1. Add normalized invoice number column ==========
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS invoice_number_norm TEXT;

-- ========== 2. Add status and reconciliation columns ==========
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'parsed_ok';

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS reconciliation_delta NUMERIC(10, 2);

-- ========== 3. Populate invoice_number_norm for existing rows ==========
-- Normalization: trim, uppercase, normalize dashes, remove trailing punctuation
UPDATE invoices
SET invoice_number_norm = UPPER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRIM(COALESCE(invoice_number, '')),
        '[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]', '-', 'g'  -- normalize unicode dashes
      ),
      '[.\s]+$', '', 'g'  -- remove trailing punctuation/whitespace
    ),
    '\s+', ' ', 'g'  -- collapse internal whitespace
  )
)
WHERE invoice_number IS NOT NULL AND invoice_number_norm IS NULL;

-- For rows without invoice_number, set empty string (will fail new constraint)
UPDATE invoices
SET invoice_number_norm = ''
WHERE invoice_number IS NULL AND invoice_number_norm IS NULL;

-- ========== 4. Make invoice_number_norm NOT NULL ==========
-- First ensure no nulls remain
UPDATE invoices SET invoice_number_norm = '' WHERE invoice_number_norm IS NULL;

ALTER TABLE invoices
ALTER COLUMN invoice_number_norm SET NOT NULL;

-- ========== 5. Drop old unique index if exists ==========
DROP INDEX IF EXISTS idx_invoices_dedupe_key;

-- ========== 6. Create new unique index on normalized key ==========
-- Partial index: only where invoice_number_norm is not empty
CREATE UNIQUE INDEX idx_invoices_dedupe_key_norm
ON invoices (company_id, invoice_number_norm, invoice_date, total)
WHERE invoice_number_norm != '';

-- ========== 7. Verify migration ==========
SELECT
  COUNT(*) as total_invoices,
  COUNT(CASE WHEN invoice_number_norm = '' THEN 1 END) as empty_norm,
  COUNT(CASE WHEN invoice_number_norm != '' THEN 1 END) as valid_norm
FROM invoices;

COMMIT;

-- ========== Done ==========
-- New columns added: invoice_number_norm, status, reconciliation_delta
-- New unique index on: (company_id, invoice_number_norm, invoice_date, total)
