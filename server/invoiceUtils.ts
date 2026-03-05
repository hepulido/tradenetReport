/**
 * Invoice Utility Functions
 *
 * Production-grade utilities for invoice processing.
 */

/**
 * Normalize invoice number for deduplication.
 *
 * Rules:
 * 1. Trim leading/trailing whitespace
 * 2. Convert to uppercase
 * 3. Replace all Unicode dash variants with ASCII hyphen
 * 4. Remove trailing punctuation (periods, commas, etc.)
 * 5. Collapse multiple internal spaces to single space
 *
 * @param raw - The raw invoice number string
 * @returns Normalized invoice number, or empty string if input is null/undefined/empty
 *
 * @example
 * normalizeInvoiceNumber("120040985-00 ")     // "120040985-00"
 * normalizeInvoiceNumber("120040985–00")      // "120040985-00" (en-dash to hyphen)
 * normalizeInvoiceNumber("inv-123.")          // "INV-123"
 * normalizeInvoiceNumber("  ABC  123  ")      // "ABC 123"
 */
export function normalizeInvoiceNumber(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) {
    return "";
  }

  let normalized = raw;

  // Step 1: Trim whitespace
  normalized = normalized.trim();

  // Step 2: Replace Unicode dash variants with ASCII hyphen
  // Unicode dashes: ‐ ‑ ‒ – — ― ⁻ ₋ − ﹘ ﹣ －
  const unicodeDashes = /[\u2010\u2011\u2012\u2013\u2014\u2015\u207B\u208B\u2212\uFE58\uFE63\uFF0D]/g;
  normalized = normalized.replace(unicodeDashes, "-");

  // Step 3: Remove trailing punctuation (., ,, ;, :, etc.)
  normalized = normalized.replace(/[.,;:\s]+$/, "");

  // Step 4: Collapse multiple internal spaces to single space
  normalized = normalized.replace(/\s+/g, " ");

  // Step 5: Convert to uppercase
  normalized = normalized.toUpperCase();

  return normalized;
}

/**
 * Calculate reconciliation delta between line totals and invoice total.
 *
 * @param subtotal - Subtotal amount (nullable)
 * @param tax - Tax amount (nullable)
 * @param shipping - Shipping amount (nullable)
 * @param total - Invoice total
 * @returns Absolute difference, or null if subtotal is not available
 */
export function calculateReconciliationDelta(
  subtotal: number | null | undefined,
  tax: number | null | undefined,
  shipping: number | null | undefined,
  total: number
): number | null {
  if (subtotal === null || subtotal === undefined) {
    return null;
  }

  const calculated = subtotal + (tax || 0) + (shipping || 0);
  return Math.abs(calculated - total);
}

/**
 * Reconciliation threshold for flagging invoices for review.
 * If delta exceeds this, invoice status should be "needs_review".
 */
export const RECONCILIATION_THRESHOLD = 0.02;

/**
 * Check if an invoice needs review based on reconciliation delta.
 *
 * @param delta - The reconciliation delta
 * @returns true if delta exceeds threshold
 */
export function needsReconciliationReview(delta: number | null): boolean {
  if (delta === null) {
    return false;
  }
  return delta > RECONCILIATION_THRESHOLD;
}

/**
 * Postgres unique constraint violation error code.
 */
export const PG_UNIQUE_VIOLATION = "23505";

/**
 * Check if an error is a Postgres unique constraint violation.
 *
 * @param error - The error to check
 * @returns true if it's a unique violation
 */
export function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  // Drizzle/pg wraps the error
  const err = error as any;

  // Check for Postgres error code
  if (err.code === PG_UNIQUE_VIOLATION) {
    return true;
  }

  // Check nested cause
  if (err.cause && err.cause.code === PG_UNIQUE_VIOLATION) {
    return true;
  }

  // Check error message as fallback
  if (typeof err.message === "string" && err.message.includes("unique constraint")) {
    return true;
  }

  return false;
}

/**
 * Error thrown when invoice number is missing.
 */
export class InvoiceNumberRequiredError extends Error {
  constructor() {
    super("Cannot persist invoice without invoiceNumber");
    this.name = "InvoiceNumberRequiredError";
  }
}
