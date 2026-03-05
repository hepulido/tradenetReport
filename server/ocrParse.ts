// server/ocrParse.ts

export type ParsedOcrDoc = {
  docType: "materials_usage" | "invoice_unknown" | "invoice_with_items";
  projectName?: string | null;
  vendorOrClient?: string | null;
  totals?: { possibleTotals: number[] };
  totalsDebug?: any; // Debug info for totals detection
  lineItems: Array<{
    description: string;
    unit?: string | null;
    ordered?: number | null;
    used?: number | null;
    // OCR invoice line item fields (fallback parser)
    quantity?: number | null;
    productCode?: string | null;
    lineAmount?: number | null;
    rawLine?: string;
  }>;
  lineItemsDebug?: OcrLineItemDebug; // Debug info for line item extraction
  warnings: string[];
};

// ========== OCR LINE ITEM FALLBACK PARSER ==========

export type OcrLineItem = {
  quantity?: number | null;
  productCode?: string | null;
  description: string;
  lineAmount: number;
  rawLine: string;
};

export type OcrLineItemDebug = {
  method: "ordered_used" | "ocr_table" | "none" | "insufficient_items" | "header_no_items";
  candidateLinesScanned: number;
  lineItemsExtracted: number;
  tableHeaderFound: boolean;
  tableHeaderLine?: string;
  tableHeaderIndex?: number;
  tableEndLine?: string;
  tableEndIndex?: number;
  skippedLines: Array<{ line: string; reason: string }>;
  rejectedReasonCounts?: Record<string, number>;
  fallbackReason?: string; // Reason to trigger LLM fallback
};

// Keywords that indicate the START of a line-item table header
// MUST have at least 2 of these to be considered a valid header
const TABLE_HEADER_KEYWORDS = [
  /\b(?:qty|quantity)\b/i,
  /\bordered\b/i,
  /\bshipped\b/i,
  /\bunit\b/i,
  /\b(?:description|item|product)\b/i,
  /\b(?:price|unit\s*price|rate)\b/i,
  /\b(?:amount|ext(?:ended)?)\b/i,
];

// Patterns that indicate END of line-item section (footer/summary rows)
const TABLE_END_PATTERNS = [
  /^\s*(?:sub\s*)?total\b/i,
  /^\s*tax(?:es)?\b/i,
  /^\s*shipping\b/i,
  /^\s*freight\b/i,
  /^\s*discount\b/i,
  /^\s*(?:grand\s*)?total\b/i,
  /^\s*amount\s*due\b/i,
  /^\s*balance\s*(?:due)?\b/i,
  /^\s*payment\s*(?:due)?\b/i,
  /^\s*please\s*pay\b/i,
  /^\s*remit\s*to\b/i,
];

// Patterns to skip (not line items) - EXPANDED for better junk rejection
const LINE_SKIP_PATTERNS = [
  /^page\s*\d+/i,
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/, // Date only
  /^invoice\s*(?:#|no|number)/i,
  /^po\s*(?:#|no|number)/i,
  /^order\s*(?:#|no|number)/i,
  /^customer\s*(?:#|no|id)/i,
  /^ship\s*to\b/i,
  /^bill\s*to\b/i,
  /^sold\s*to\b/i,
  /^terms\b/i,
  /^due\s*date\b/i,
  /^---.*---$/, // File markers

  // ========== ADDRESS PATTERNS (CRITICAL) ==========
  // Street address at start: 123 Main St, 456 Oak Ave, etc.
  /^\d+\s+\w+\s+(?:st(?:reet)?|ave(?:nue)?|rd|road|blvd|boulevard|dr(?:ive)?|ln|lane|way|court|ct|pl(?:ace)?|cir(?:cle)?|pkwy|parkway|hwy|highway|ter(?:race)?|apt)\b/i,
  // Street addresses anywhere
  /\b(?:st(?:reet)?|ave(?:nue)?|rd|road|blvd|boulevard|dr(?:ive)?|ln|lane|way|court|ct|pl(?:ace)?|cir(?:cle)?|pkwy|parkway|hwy|highway|ter(?:race)?)\s*(?:#|\d|$)/i,
  // PO Box
  /\bpo\s*box\s+\d+/i,
  /\bp\.?o\.?\s*box/i,
  // City, State ZIP patterns
  /\b[A-Z][a-z]+,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?/,
  // ZIP code only at end
  /\b\d{5}(?:-\d{4})?\s*$/,
  // APT/UNIT/SUITE patterns
  /\b(?:apt|unit|suite|ste|#)\s*[A-Z0-9]+\b/i,

  // ========== PHONE/FAX PATTERNS ==========
  /\bph(?:one)?[:\s]*\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/i,
  /\bfax[:\s]*\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/i,
  /^\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}$/, // Standalone phone

  // ========== MAILING/POSTAGE PATTERNS ==========
  /\breturn\s*service\s*requested/i,
  /\bpresorted\s*standard/i,
  /\bus\s*postage\s*paid/i,
  /\bfirst[\s\-]?class\s*mail/i,
  /\baddress\s*service\s*requested/i,
  /\bpermit\s*no/i,
  /\bprsrt\s*std/i,
  /\bnonprofit\s*org/i,

  // ========== HEADER/LABEL PATTERNS ==========
  /^thank\s*you/i,
  /^remit\s*to\b/i,
  /^please\s*(?:pay|remit)/i,
  /^attention\b/i,
  /^attn\b/i,
];

/**
 * Check if a line looks like a table header row
 */
function isTableHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  let keywordMatches = 0;

  for (const pattern of TABLE_HEADER_KEYWORDS) {
    if (pattern.test(lower)) {
      keywordMatches++;
    }
  }

  // Need at least 2 keywords to be a header (e.g., "Qty" and "Description" or "Price" and "Amount")
  return keywordMatches >= 2;
}

/**
 * Check if a line marks the end of line items (subtotal, tax, etc.)
 */
function isTableEndLine(line: string): boolean {
  for (const pattern of TABLE_END_PATTERNS) {
    if (pattern.test(line)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a line should be skipped (metadata, headers, addresses, etc.)
 */
function shouldSkipLine(line: string): { skip: boolean; reason?: string } {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length < 3) {
    return { skip: true, reason: "too_short" };
  }

  // Check explicit skip patterns
  for (const pattern of LINE_SKIP_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { skip: true, reason: "metadata_pattern" };
    }
  }

  // Additional address heuristics
  const lower = trimmed.toLowerCase();

  // Skip if contains common street suffixes with numbers
  if (/\d+\s+(?:n|s|e|w|ne|nw|se|sw)?\s*\d*\s*(?:st|ave|rd|blvd|dr|ln|way|ct|ter|apt)/i.test(trimmed)) {
    return { skip: true, reason: "address_line" };
  }

  // Skip PO Box lines
  if (/po\s*box/i.test(trimmed)) {
    return { skip: true, reason: "po_box" };
  }

  // Skip lines that look like city/state/zip
  if (/^[A-Z][a-z]+,?\s+[A-Z]{2}\s+\d{5}/i.test(trimmed)) {
    return { skip: true, reason: "city_state_zip" };
  }

  // Skip lines that are mostly numbers with few letters (likely IDs, phone numbers, dates)
  const digits = (trimmed.match(/\d/g) || []).length;
  const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (digits > 5 && letters < 3 && trimmed.length < 20) {
    return { skip: true, reason: "numeric_id" };
  }

  return { skip: false };
}

/**
 * Extract a currency amount from the END of a line (rightmost money value)
 * This is typically the line total/extended amount
 */
function extractLineAmount(line: string): number | null {
  // Pattern for money: $1,234.56 or 1234.56 or 1,234 (with optional $ and commas)
  const moneyPattern = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/g;
  const matches = Array.from(line.matchAll(moneyPattern));

  if (matches.length === 0) return null;

  // Take the LAST (rightmost) amount - typically the line total
  const lastMatch = matches[matches.length - 1];
  const cleaned = lastMatch[1].replace(/,/g, "");
  const amount = parseFloat(cleaned);

  return isNaN(amount) ? null : amount;
}

/**
 * Extract quantity from the beginning of a line
 * Handles: "5", "5.00", "16.00", etc.
 */
function extractQuantity(line: string): { quantity: number | null; remainder: string } {
  // Match quantity at start: digits with optional decimal
  const qtyMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s+/);
  if (qtyMatch) {
    const qty = parseFloat(qtyMatch[1]);
    return {
      quantity: isNaN(qty) ? null : qty,
      remainder: line.slice(qtyMatch[0].length),
    };
  }
  return { quantity: null, remainder: line };
}

/**
 * Extract product code (uppercase alphanumeric, often with dashes)
 * Examples: CGAHD8906F08G, ARM-DRY-12, SKU12345
 */
function extractProductCode(text: string): { productCode: string | null; remainder: string } {
  // Product codes are typically all-caps alphanumeric, 5+ chars, may have dashes
  const codeMatch = text.match(/^\s*([A-Z0-9][A-Z0-9\-]{4,}[A-Z0-9])\s+/);
  if (codeMatch) {
    return {
      productCode: codeMatch[1],
      remainder: text.slice(codeMatch[0].length),
    };
  }
  return { productCode: null, remainder: text };
}

/**
 * Check if a string looks like a product code (alphanumeric, 6+ chars)
 */
function isProductCodeLike(str: string): boolean {
  // Product codes: CGAHD8906F08G, ARM-DRY-12, SKU12345
  return /^[A-Z0-9][A-Z0-9\-]{4,}[A-Z0-9]$/i.test(str);
}

/**
 * Parse a single OCR line into a structured line item
 *
 * STRICT REQUIREMENTS:
 * - Must have a money amount
 * - Must have EITHER:
 *   - A product code pattern (e.g., CGAHD8906F08G), OR
 *   - A quantity + amount with description > 10 chars
 * - Description must not look like an address
 *
 * Expected formats:
 *   "5.00 CGAHD8906F08G ARM DRYWALL 12' MAIN 8" OC FACETED (12/CTN) 1,044.00"
 *   "16 Some product description here 2,276.35"
 */
function parseOcrLineItem(line: string): OcrLineItem | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Must have at least one money amount to be a valid line item
  const lineAmount = extractLineAmount(trimmed);
  if (lineAmount === null || lineAmount <= 0) {
    return null;
  }

  // Try to extract quantity from the beginning
  const { quantity, remainder: afterQty } = extractQuantity(trimmed);

  // Try to extract product code
  const { productCode, remainder: afterCode } = extractProductCode(afterQty);

  // The description is everything between code/qty and the amounts
  // Remove trailing money values from description
  let description = afterCode.trim();

  // Remove money amounts from the end of description
  description = description
    .replace(/\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*$/g, "")
    .replace(/\s*\d+\.\d{2}\s*$/g, "")
    .trim();

  // If we consumed quantity, also try to remove unit price (second-to-last number)
  if (quantity !== null) {
    description = description
      .replace(/\s*\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*$/g, "")
      .replace(/\s*\d+\.\d{2}\s*$/g, "")
      .trim();
  }

  // Clean up extra whitespace
  description = description.replace(/\s+/g, " ").trim();

  // If description is too short after cleaning, use more of the original
  if (description.length < 3 && afterQty.length > description.length) {
    description = afterQty.replace(/\s*\$?\s*[\d,]+\.?\d*\s*$/g, "").trim();
  }

  // Final fallback: use what we have
  if (!description) {
    description = productCode || "Unknown item";
  }

  // ========== STRICT VALIDATION ==========
  // Require EITHER product code OR (qty + desc > 10 chars)
  const hasProductCode = productCode !== null && isProductCodeLike(productCode);
  const hasValidQtyAndDesc = quantity !== null && description.length > 10;

  if (!hasProductCode && !hasValidQtyAndDesc) {
    // Neither valid product code nor qty+description
    return null;
  }

  // Reject if description looks like an address
  const descLower = description.toLowerCase();
  if (/\b(?:st|ave|rd|blvd|dr|ln|way|ct|ter|apt|box|suite|ste)\b/i.test(description)) {
    // Check if it's actually an address (has numbers + street suffix)
    if (/\d+\s+\w+\s+(?:st|ave|rd|blvd|dr|ln|way|ct|ter|apt)/i.test(description)) {
      return null;
    }
  }

  // Reject if looks like city/state/zip
  if (/^[A-Z][a-z]+,?\s+[A-Z]{2}\s+\d{5}/i.test(description)) {
    return null;
  }

  // Reject suspiciously high quantities (likely parsing error)
  if (quantity !== null && quantity > 10000) {
    return null;
  }

  return {
    quantity,
    productCode,
    description,
    lineAmount,
    rawLine: trimmed,
  };
}

/**
 * Fallback OCR line-item parser for invoice-style tables
 *
 * STRICT Strategy:
 * 1. MUST find table header (at least 2 of: Qty, Ordered, Shipped, Unit, Description, Price, Amount)
 * 2. Only start capturing AFTER header found
 * 3. Parse lines until hitting Subtotal/Tax/Total
 * 4. Each line must have product code OR (qty + amount + desc > 10 chars)
 * 5. Hard reject address/header/mailing lines
 *
 * Returns extracted items and debug info
 */
export function parseOcrTableLineItems(lines: string[]): {
  items: OcrLineItem[];
  debug: OcrLineItemDebug;
} {
  const items: OcrLineItem[] = [];
  const skippedLines: Array<{ line: string; reason: string }> = [];
  const rejectedReasonCounts: Record<string, number> = {};
  let candidateLinesScanned = 0;
  let tableHeaderFound = false;
  let tableHeaderLine: string | undefined;
  let tableHeaderIndex: number | undefined;
  let tableEndLine: string | undefined;
  let tableEndIndex: number | undefined;
  let inTable = false;

  const addRejection = (reason: string) => {
    rejectedReasonCounts[reason] = (rejectedReasonCounts[reason] || 0) + 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Look for table header (MUST find before extracting items)
    if (!tableHeaderFound && isTableHeaderLine(line)) {
      tableHeaderFound = true;
      tableHeaderLine = line;
      tableHeaderIndex = i;
      inTable = true;
      continue;
    }

    // Check for table end
    if (inTable && isTableEndLine(line)) {
      tableEndLine = line;
      tableEndIndex = i;
      break; // Stop at subtotal/total
    }

    // STRICT: Skip if no table header found yet
    // Don't try to detect items without a header (too error-prone)
    if (!inTable) {
      continue;
    }

    // Check if line should be skipped
    const skipCheck = shouldSkipLine(line);
    if (skipCheck.skip) {
      skippedLines.push({ line: line.slice(0, 60), reason: skipCheck.reason || "unknown" });
      addRejection(skipCheck.reason || "unknown");
      continue;
    }

    candidateLinesScanned++;

    // Try to parse as line item (now with stricter validation)
    const item = parseOcrLineItem(line);
    if (item) {
      items.push(item);
    } else {
      skippedLines.push({ line: line.slice(0, 60), reason: "invalid_line_item" });
      addRejection("invalid_line_item");
    }
  }

  // STRICT: Require at least 2 valid items to return anything
  // This prevents false positives from random lines that happen to match
  const MIN_REQUIRED_ITEMS = 2;
  const finalItems = items.length >= MIN_REQUIRED_ITEMS ? items : [];

  // Determine extraction method and special fallback reason
  let method: OcrLineItemDebug["method"] = "none";
  let fallbackReason: string | undefined;

  if (finalItems.length > 0) {
    method = "ocr_table";
  } else if (tableHeaderFound && items.length > 0 && items.length < MIN_REQUIRED_ITEMS) {
    method = "insufficient_items";
    fallbackReason = `Table header found but only ${items.length} item(s) extracted (need ${MIN_REQUIRED_ITEMS}+)`;
  } else if (tableHeaderFound && items.length === 0) {
    method = "header_no_items";
    fallbackReason = "Table headers found but no line items extracted";
  }

  return {
    items: finalItems,
    debug: {
      method,
      candidateLinesScanned,
      lineItemsExtracted: finalItems.length,
      tableHeaderFound,
      tableHeaderLine,
      tableHeaderIndex,
      tableEndLine,
      tableEndIndex,
      skippedLines: skippedLines.slice(0, 15), // Limit debug output
      rejectedReasonCounts,
      fallbackReason, // NEW: Reason to trigger LLM fallback
    },
  };
}

// UI noise patterns to ignore
const NOISE_PATTERNS = [
  /^logout$/i,
  /^request$/i,
  /^requests?$/i,
  /^log\s*usage$/i,
  /^projects?$/i,
  /^pos\/index$/i,
  /^requests\/index$/i,
  /^projects\/\[id\]$/i,
  /^home$/i,
  /^menu$/i,
  /^dashboard$/i,
  /^settings$/i,
  /^---\s*.+\s*---$/,  // File header markers like "--- filename ---"
];

// Regex to match unit lines: EA or FT with Ordered and Used values
// Handles formats like:
//   "EA . Ordered: 100.00 Used: 50.00"
//   "FT . Ordered: 100.00 . Used: 2.35"
//   "EA Ordered: 10 Used: 5"
const UNIT_LINE_REGEX = /^(EA|FT)\s*\.?\s*Ordered:\s*([0-9]+(?:\.[0-9]+)?)\s*\.?\s*Used:\s*([0-9]+(?:\.[0-9]+)?)$/i;

// Regex to match standalone numeric values (potential totals)
const STANDALONE_NUMBER_REGEX = /^[0-9]+\.[0-9]{2}$/;

// ========== STEP 5: IMPROVED TOTALS DETECTION ==========

// Priority-ordered total labels (higher priority = more likely the real total)
const TOTAL_LABEL_PATTERNS: Array<{ pattern: RegExp; priority: number; isSubtotal: boolean; label: string }> = [
  // Highest priority - explicit payment totals
  { pattern: /\b(?:TOTAL\s*DUE|AMOUNT\s*DUE|BALANCE\s*DUE|AMOUNT\s*OWED)\b/i, priority: 100, isSubtotal: false, label: "amount_due" },
  { pattern: /\b(?:PAY\s*THIS\s*AMOUNT|PLEASE\s*PAY|PAYMENT\s*DUE)\b/i, priority: 100, isSubtotal: false, label: "payment_due" },
  // High priority - invoice/grand totals
  { pattern: /\b(?:INVOICE\s*TOTAL|GRAND\s*TOTAL|TOTAL\s*AMOUNT|NET\s*TOTAL)\b/i, priority: 95, isSubtotal: false, label: "invoice_total" },
  // Medium-high - Balance patterns (common in statements)
  { pattern: /\b(?:BALANCE|NEW\s*BALANCE|CURRENT\s*BALANCE|ACCOUNT\s*BALANCE)\b/i, priority: 90, isSubtotal: false, label: "balance" },
  // Medium priority - generic TOTAL (but not SUBTOTAL)
  { pattern: /\bTOTAL\b(?!\s*(?:HOURS|ITEMS|QTY|QUANTITY|UNITS|COUNT|WEIGHT|PIECES|SAVINGS))/i, priority: 80, isSubtotal: false, label: "total" },
  // Lower priority - subtotals (still useful if no TOTAL found)
  { pattern: /\bSUBTOTAL\b/i, priority: 40, isSubtotal: true, label: "subtotal" },
  // Tax/shipping (can help identify invoice structure, but not the payable amount)
  { pattern: /\b(?:TAX|SALES\s*TAX|VAT|GST|HST)\b/i, priority: 20, isSubtotal: true, label: "tax" },
  { pattern: /\b(?:SHIPPING|FREIGHT|DELIVERY|HANDLING)\b/i, priority: 10, isSubtotal: true, label: "shipping" },
];

// Patterns to EXCLUDE from totals (these are counts, not money)
const TOTAL_EXCLUSION_PATTERNS = [
  /\bTOTAL\s*(?:HOURS|ITEMS|QTY|QUANTITY|UNITS|COUNT|WEIGHT|PIECES|LINES?)\b/i,
  /\b(?:HOURS|ITEMS|QTY)\s*TOTAL\b/i,
  /\bPAGE\s*\d+\s*OF\s*\d+\b/i,
  /\bINVOICE\s*(?:#|NO|NUMBER)\b/i,
  /\b(?:PO|ORDER)\s*(?:#|NO|NUMBER)\b/i,
];

// Parse currency amount: handles $12,500.00, 12500.00, 12,500, etc.
function parseCurrencyAmount(str: string): number | null {
  // Remove currency symbols, whitespace, and thousands separators
  const cleaned = str
    .replace(/[$€£¥]/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  // Match decimal number
  const match = cleaned.match(/^-?(\d+(?:\.\d{1,2})?)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  return isNaN(num) ? null : num;
}

// Extract amounts from a line of text
function extractAmountsFromLine(line: string): number[] {
  const amounts: number[] = [];

  // Pattern to find money amounts: $12,500.00, 12500.00, 12,500, etc.
  const moneyPattern = /\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2}/g;
  const matches = line.match(moneyPattern);

  if (matches) {
    for (const m of matches) {
      const amount = parseCurrencyAmount(m);
      if (amount !== null && amount > 0) {
        amounts.push(amount);
      }
    }
  }

  return amounts;
}

// Check if a line should be excluded from total detection
function isExcludedTotalLine(line: string): boolean {
  for (const pattern of TOTAL_EXCLUSION_PATTERNS) {
    if (pattern.test(line)) {
      return true;
    }
  }
  return false;
}

type DetectedTotal = {
  amount: number;
  priority: number;
  isSubtotal: boolean;
  labelType: string; // e.g., "amount_due", "balance", "total"
  matchedLine: string;
  lineIndex: number;
  confidence: number;
  score: number; // Final computed score for ranking
  scoreExplanation: string; // Why this score
};

export type TotalsDetectionResult = {
  totals: number[];
  warnings: string[];
  debug: DetectedTotal[];
  bestMatch: DetectedTotal | null;
  selectionReason: string;
};

// Minimum plausible invoice total (values below this are likely not the real total)
const MIN_PLAUSIBLE_TOTAL = 10;
// Threshold where amounts start getting penalty
const TINY_AMOUNT_THRESHOLD = 50;

/**
 * Calculate a score for a detected total candidate
 * Higher score = more likely to be the real invoice total
 */
function scoreTotal(detected: Omit<DetectedTotal, 'score' | 'scoreExplanation'>): { score: number; explanation: string } {
  let score = detected.priority;
  const reasons: string[] = [`base_priority=${detected.priority}`];

  // Bonus for non-subtotal labels
  if (!detected.isSubtotal) {
    score += 20;
    reasons.push("non_subtotal=+20");
  }

  // Amount-based scoring
  const amount = detected.amount;

  // Heavy penalty for tiny amounts (likely quantities, not prices)
  if (amount < MIN_PLAUSIBLE_TOTAL) {
    score -= 80;
    reasons.push(`tiny_amount(<${MIN_PLAUSIBLE_TOTAL})=-80`);
  } else if (amount < TINY_AMOUNT_THRESHOLD) {
    // Moderate penalty for small amounts
    score -= 30;
    reasons.push(`small_amount(<${TINY_AMOUNT_THRESHOLD})=-30`);
  }

  // Bonus for amounts that look like invoice totals (hundreds to tens of thousands)
  if (amount >= 100 && amount <= 100000) {
    score += 15;
    reasons.push("reasonable_range=+15");
  }

  // Bonus for amounts with cents (common in invoices)
  if (amount !== Math.floor(amount)) {
    score += 5;
    reasons.push("has_cents=+5");
  }

  // Penalty if amount came from next line (less reliable)
  if (detected.confidence < detected.priority) {
    score -= 10;
    reasons.push("amount_from_next_line=-10");
  }

  // Bonus for high-priority labels (amount_due, invoice_total)
  if (detected.labelType === "amount_due" || detected.labelType === "payment_due") {
    score += 10;
    reasons.push("high_priority_label=+10");
  }

  return { score, explanation: reasons.join(", ") };
}

// Detect totals from OCR text with improved heuristics
function detectTotals(lines: string[]): TotalsDetectionResult {
  const detected: DetectedTotal[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip excluded lines
    if (isExcludedTotalLine(line)) {
      continue;
    }

    // Check each label pattern
    for (const { pattern, priority, isSubtotal, label: labelType } of TOTAL_LABEL_PATTERNS) {
      if (pattern.test(line)) {
        // Extract amounts from this line
        let amounts = extractAmountsFromLine(line);
        let amountFromNextLine = false;

        // If no amount on this line, check the next line (common OCR pattern)
        if (amounts.length === 0 && i + 1 < lines.length) {
          amounts = extractAmountsFromLine(lines[i + 1]);
          amountFromNextLine = amounts.length > 0;
        }

        // Process each amount found (not just the max - we'll score them all)
        for (const amount of amounts) {
          // Calculate base confidence
          const confidence = priority - (amountFromNextLine ? 10 : 0);

          const partial = {
            amount,
            priority,
            isSubtotal,
            labelType,
            matchedLine: line.slice(0, 80),
            lineIndex: i,
            confidence,
          };

          const { score, explanation } = scoreTotal(partial);

          detected.push({
            ...partial,
            score,
            scoreExplanation: explanation,
          });
        }
        break; // Only match first pattern per line
      }
    }
  }

  // Sort by SCORE (highest first), not just priority
  detected.sort((a, b) => b.score - a.score);

  // Build result: prefer non-subtotals with best scores, deduplicate
  const seen = new Set<number>();
  const totals: number[] = [];
  let bestMatch: DetectedTotal | null = null;
  let selectionReason = "";

  // First pass: add non-subtotals with good scores
  for (const d of detected) {
    if (!d.isSubtotal && !seen.has(d.amount) && d.score > 0) {
      totals.push(d.amount);
      seen.add(d.amount);
      if (!bestMatch) {
        bestMatch = d;
        selectionReason = `Selected "${d.labelType}" total $${d.amount} (score=${d.score}): ${d.scoreExplanation}`;
      }
    }
  }

  // Second pass: add subtotals if we need more candidates
  if (totals.length === 0) {
    for (const d of detected) {
      if (!seen.has(d.amount) && d.score > -50) { // Only add if not heavily penalized
        totals.push(d.amount);
        seen.add(d.amount);
        if (!bestMatch) {
          bestMatch = d;
          selectionReason = `Selected "${d.labelType}" (subtotal) $${d.amount} (score=${d.score}): ${d.scoreExplanation}`;
        }
      }
    }
    if (totals.length > 0) {
      warnings.push("Only subtotals found, no definitive TOTAL line detected");
    }
  }

  // If still no good match, look for the largest reasonably-scored amount
  if (totals.length === 0 && detected.length > 0) {
    // Sort by amount descending for fallback
    const sortedByAmount = [...detected].sort((a, b) => b.amount - a.amount);
    for (const d of sortedByAmount) {
      if (d.amount >= MIN_PLAUSIBLE_TOTAL && !seen.has(d.amount)) {
        totals.push(d.amount);
        seen.add(d.amount);
        if (!bestMatch) {
          bestMatch = d;
          selectionReason = `Fallback to largest plausible amount $${d.amount} (score=${d.score})`;
        }
      }
    }
  }

  if (!selectionReason && totals.length === 0) {
    selectionReason = "No valid totals detected";
  }

  return { totals, warnings, debug: detected.slice(0, 10), bestMatch, selectionReason };
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function parseNumber(str: string): number | null {
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export function parseOcrToStructured(text: string): ParsedOcrDoc {
  const warnings: string[] = [];
  const lineItems: ParsedOcrDoc["lineItems"] = [];
  const legacyTotals: number[] = []; // From standalone numbers (fallback)
  let projectName: string | null = null;
  let vendorOrClient: string | null = null;

  // Split into lines, trim, filter empty
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  // Track non-noise lines for description lookup
  const nonNoiseLines: { index: number; text: string }[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (isNoiseLine(line)) {
      continue;
    }

    // Check if this is a unit line (EA/FT with Ordered/Used)
    const unitMatch = line.match(UNIT_LINE_REGEX);
    if (unitMatch) {
      const unit = unitMatch[1].toUpperCase();
      const ordered = parseNumber(unitMatch[2]);
      const used = parseNumber(unitMatch[3]);

      // Find the description: closest previous non-noise line
      let description = "Unknown item";
      if (nonNoiseLines.length > 0) {
        const lastNonNoise = nonNoiseLines[nonNoiseLines.length - 1];
        description = lastNonNoise.text;
        // Remove it so it's not reused for another item
        nonNoiseLines.pop();
      } else {
        warnings.push(`No description found for unit line at position ${i}: "${line}"`);
      }

      lineItems.push({
        description,
        unit,
        ordered,
        used,
      });

      continue;
    }

    // Check if this is a standalone number (potential total - legacy fallback)
    if (STANDALONE_NUMBER_REGEX.test(line)) {
      const num = parseNumber(line);
      if (num !== null) {
        legacyTotals.push(num);
      }
      continue;
    }

    // Try to detect project name (heuristic: after "CSV Import Test" or similar markers)
    if (projectName === null) {
      // Look for lines that could be project/client names
      // These are typically short, don't look like data, and come early
      if (
        line.length < 50 &&
        !line.includes(":") &&
        !STANDALONE_NUMBER_REGEX.test(line) &&
        nonNoiseLines.length < 5
      ) {
        // Could be a project or vendor name
        if (line.toLowerCase().includes("test") || line.toLowerCase().includes("project")) {
          projectName = line;
        } else if (vendorOrClient === null && nonNoiseLines.length === 0) {
          // First meaningful line could be vendor/client
          vendorOrClient = line;
        }
      }
    }

    // Track this as a non-noise line (potential description for next unit line)
    nonNoiseLines.push({ index: i, text: line });
  }

  // ========== IMPROVED TOTALS DETECTION (STEP 5) ==========
  // Use smart detection first, fall back to legacy standalone numbers
  const totalsResult = detectTotals(rawLines);
  warnings.push(...totalsResult.warnings);

  // Merge: prefer smart-detected totals, then legacy standalone numbers
  let possibleTotals: number[] = [];
  let totalsDebug: any = null;

  if (totalsResult.totals.length > 0) {
    possibleTotals = totalsResult.totals;
    totalsDebug = {
      method: "labeled",
      selectionReason: totalsResult.selectionReason,
      bestMatch: totalsResult.bestMatch ? {
        amount: totalsResult.bestMatch.amount,
        labelType: totalsResult.bestMatch.labelType,
        score: totalsResult.bestMatch.score,
        scoreExplanation: totalsResult.bestMatch.scoreExplanation,
        matchedLine: totalsResult.bestMatch.matchedLine,
      } : null,
      allMatches: totalsResult.debug.slice(0, 8).map(d => ({
        amount: d.amount,
        labelType: d.labelType,
        score: d.score,
        scoreExplanation: d.scoreExplanation,
        isSubtotal: d.isSubtotal,
      })),
    };
  } else if (legacyTotals.length > 0) {
    // Sort legacy totals descending (largest first = most likely invoice total)
    // But also filter out tiny values that are likely not real totals
    const filteredTotals = legacyTotals.filter(t => t >= MIN_PLAUSIBLE_TOTAL);
    possibleTotals = filteredTotals.length > 0
      ? [...filteredTotals].sort((a, b) => b - a)
      : [...legacyTotals].sort((a, b) => b - a);
    warnings.push("No labeled TOTAL/AMOUNT DUE found; using standalone numbers as fallback");
    totalsDebug = {
      method: "standalone_numbers",
      selectionReason: `Fallback: selected largest standalone number $${possibleTotals[0]}`,
      values: possibleTotals.slice(0, 5),
      filteredOutTiny: legacyTotals.filter(t => t < MIN_PLAUSIBLE_TOTAL),
    };
  }

  // Add warning if no totals found at all
  if (possibleTotals.length === 0) {
    warnings.push("No invoice total detected. Manual review required for ledger persistence.");
    totalsDebug = { method: "none_found", selectionReason: "No valid totals detected" };
  }

  // ========== FALLBACK OCR LINE ITEM PARSER ==========
  // If no Ordered/Used line items found, try OCR table parser
  let lineItemsDebug: OcrLineItemDebug | undefined;

  if (lineItems.length === 0) {
    const ocrTableResult = parseOcrTableLineItems(rawLines);
    lineItemsDebug = ocrTableResult.debug;

    if (ocrTableResult.items.length > 0) {
      // Convert OCR line items to the standard format
      for (const item of ocrTableResult.items) {
        lineItems.push({
          description: item.description,
          quantity: item.quantity,
          productCode: item.productCode,
          lineAmount: item.lineAmount,
          rawLine: item.rawLine,
          // Leave Ordered/Used fields undefined for OCR items
          unit: null,
          ordered: null,
          used: null,
        });
      }
      console.log(`[ocrParse] Fallback OCR parser extracted ${ocrTableResult.items.length} line items`);
    } else {
      // Only add warning if BOTH parsers failed
      warnings.push("No line items found (tried Ordered/Used and OCR table patterns)");
    }
  } else {
    // Ordered/Used parser succeeded
    lineItemsDebug = {
      method: "ordered_used",
      candidateLinesScanned: rawLines.length,
      lineItemsExtracted: lineItems.length,
      tableHeaderFound: false,
      skippedLines: [],
    };
  }

  // Determine document type based on what we found
  let docType: ParsedOcrDoc["docType"];
  if (lineItems.length > 0) {
    // Check if these are Ordered/Used items or OCR table items
    const hasOrderedUsed = lineItems.some(li => li.ordered !== null || li.used !== null);
    docType = hasOrderedUsed ? "materials_usage" : "invoice_with_items";
  } else {
    docType = "invoice_unknown";
  }

  // ========== VENDOR EXTRACTION ==========
  // If vendorOrClient not found yet, try extracting from top lines
  if (!vendorOrClient) {
    const extracted = extractVendorName(text);
    if (extracted.vendorName) {
      vendorOrClient = extracted.vendorName;
    }
  }

  return {
    docType,
    projectName,
    vendorOrClient,
    totals: possibleTotals.length > 0 ? { possibleTotals } : undefined,
    totalsDebug: totalsDebug,
    lineItems,
    lineItemsDebug,
    warnings,
  };
}

// ========== VENDOR DETECTION + NORMALIZATION ==========

// Patterns that indicate vendor/company header lines
const VENDOR_LABEL_PATTERNS = [
  /^\s*(?:invoice\s*from|bill\s*from|from|vendor|supplier|remit\s*to|sold\s*by|shipped\s*from)\s*[:\-]?\s*/i,
];

// Patterns to EXCLUDE from vendor detection
const VENDOR_EXCLUSION_PATTERNS = [
  /^(?:project|job|client|customer|bill\s*to|ship\s*to|deliver\s*to|sold\s*to)\s*[:\-]?\s*/i,
  /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/, // Dates
  /^\(\d{3}\)\s*\d{3}[\-\s]?\d{4}$/, // Phone numbers
  /^\d{3}[\-\s]?\d{3}[\-\s]?\d{4}$/, // Phone numbers
  /^[\d\s\-\(\)]+$/, // All digits/spaces (phone, ID)
  /^\$?[\d,]+\.?\d*$/, // Money amounts
  /^(?:page|pg)\s*\d+/i,
  /^(?:invoice|order|po|reference)\s*(?:#|no|number)/i,
  /^(?:date|due\s*date|terms)\s*[:\-]/i,
  /^(?:total|subtotal|tax|shipping|amount)/i,
  /^(?:qty|quantity|unit|price|amount|description|item)/i,
  /^https?:\/\//i, // URLs
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // Email addresses
];

export type VendorExtractionResult = {
  vendorName: string | null;
  confidence: number;
  evidence?: string;
};

export function extractVendorName(rawText: string): VendorExtractionResult {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const topLines = lines.slice(0, 25); // Only look at first 25 lines

  // First pass: look for labeled vendor lines
  for (const line of topLines) {
    for (const pattern of VENDOR_LABEL_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const remainder = line.slice(match[0].length).trim();
        if (remainder.length >= 3 && remainder.length <= 80 && !isExcludedVendorLine(remainder)) {
          return {
            vendorName: remainder,
            confidence: 0.9,
            evidence: `Labeled: "${line.slice(0, 50)}"`,
          };
        }
      }
    }
  }

  // Second pass: look for company-like header in first few lines
  // Companies often put their name at the very top
  for (let i = 0; i < Math.min(5, topLines.length); i++) {
    const line = topLines[i];

    // Skip excluded patterns
    if (isExcludedVendorLine(line)) continue;

    // Skip very short or very long lines
    if (line.length < 3 || line.length > 60) continue;

    // Skip lines that look like addresses (contain numbers and common address words)
    if (/^\d+\s+\w+\s+(?:st|street|ave|avenue|rd|road|blvd|drive|dr|lane|ln|way|court|ct)\b/i.test(line)) continue;

    // Skip lines that are all caps with common header words
    if (/^(?:INVOICE|BILL|STATEMENT|RECEIPT|ORDER|QUOTE|ESTIMATE)$/i.test(line)) continue;

    // Could be a company name - typically mixed case or all caps with LLC/Inc/Corp
    if (/(?:LLC|Inc|Corp|Ltd|Co\.|Company|Corporation|Services|Supply|Materials)\b/i.test(line)) {
      return {
        vendorName: line,
        confidence: 0.75,
        evidence: `Header with business suffix: "${line}"`,
      };
    }

    // First non-excluded line that looks like a name (starts with capital, reasonable length)
    if (/^[A-Z][a-zA-Z\s&\-']+$/.test(line) && line.length >= 4 && i < 3) {
      return {
        vendorName: line,
        confidence: 0.5,
        evidence: `First header line: "${line}"`,
      };
    }
  }

  return { vendorName: null, confidence: 0 };
}

function isExcludedVendorLine(line: string): boolean {
  for (const pattern of VENDOR_EXCLUSION_PATTERNS) {
    if (pattern.test(line)) return true;
  }
  return false;
}

// Normalize vendor name for deduplication
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " "); // Collapse whitespace
}

// ========== INVOICE GATING ==========

// Signals that indicate this is an invoice (not materials usage report)
const INVOICE_SIGNALS = [
  /\bINVOICE\b/i,
  /\bBILL\b/i,
  /\bSTATEMENT\b/i,
  /\bAMOUNT\s*DUE\b/i,
  /\bTOTAL\s*DUE\b/i,
  /\bBALANCE\s*DUE\b/i,
  /\bPAYMENT\s*DUE\b/i,
  /\bREMIT\s*TO\b/i,
  /\bINVOICE\s*(?:#|NO|NUMBER)\b/i,
  /\bPO\s*(?:#|NO|NUMBER)\b/i,
  /\bPURCHASE\s*ORDER\b/i,
];

// Signals that indicate this is a materials usage report (NOT an invoice)
const MATERIALS_USAGE_SIGNALS = [
  /\bMATERIALS?\s*USAGE\b/i,
  /\bUSAGE\s*REPORT\b/i,
  /\bORDERED\s*.*\s*USED\b/i,
  /\bQTY\s*ORDERED\b/i,
  /\bQTY\s*USED\b/i,
  /\bLOG\s*USAGE\b/i,
];

export type InvoiceGatingResult = {
  isInvoice: boolean;
  reason: string;
  invoiceSignalCount: number;
  usageSignalCount: number;
  hasLabeledTotal: boolean;
};

export function isInvoiceLike(
  parsedOrCategorized: { docType?: string; totals?: { possibleTotals?: number[] }; warnings?: string[] },
  rawText?: string
): InvoiceGatingResult {
  const docType = parsedOrCategorized.docType ?? "";
  const hasLabeledTotal = !(parsedOrCategorized.warnings ?? []).some(w =>
    w.includes("using standalone numbers as fallback") || w.includes("Only subtotals found")
  );
  const hasTotals = (parsedOrCategorized.totals?.possibleTotals ?? []).length > 0;

  // Count signals in raw text if provided
  let invoiceSignalCount = 0;
  let usageSignalCount = 0;

  if (rawText) {
    for (const pattern of INVOICE_SIGNALS) {
      if (pattern.test(rawText)) invoiceSignalCount++;
    }
    for (const pattern of MATERIALS_USAGE_SIGNALS) {
      if (pattern.test(rawText)) usageSignalCount++;
    }
  }

  // Decision logic:
  // 1. If docType is materials_usage AND usage signals present AND no strong invoice signals => NOT invoice
  if (docType === "materials_usage" && usageSignalCount > 0 && invoiceSignalCount < 2) {
    return {
      isInvoice: false,
      reason: "Document appears to be a materials usage report, not an invoice",
      invoiceSignalCount,
      usageSignalCount,
      hasLabeledTotal,
    };
  }

  // 2. If no totals at all => NOT invoice (can't persist without a total)
  if (!hasTotals) {
    return {
      isInvoice: false,
      reason: "No totals found in document",
      invoiceSignalCount,
      usageSignalCount,
      hasLabeledTotal,
    };
  }

  // 3. If strong invoice signals OR labeled total with some invoice signals => IS invoice
  if (invoiceSignalCount >= 2 || (hasLabeledTotal && invoiceSignalCount >= 1)) {
    return {
      isInvoice: true,
      reason: "Invoice signals detected",
      invoiceSignalCount,
      usageSignalCount,
      hasLabeledTotal,
    };
  }

  // 4. If has labeled total and docType is not materials_usage => probably invoice
  if (hasLabeledTotal && docType !== "materials_usage") {
    return {
      isInvoice: true,
      reason: "Has labeled total and not a usage report",
      invoiceSignalCount,
      usageSignalCount,
      hasLabeledTotal,
    };
  }

  // 5. If only weak totals (unlabeled numbers) and no invoice signals => needs review
  if (!hasLabeledTotal && invoiceSignalCount === 0) {
    return {
      isInvoice: false,
      reason: "Weak total signal and no invoice indicators - needs manual review",
      invoiceSignalCount,
      usageSignalCount,
      hasLabeledTotal,
    };
  }

  // 6. Default: allow if has any totals (permissive for MVP, can tighten later)
  return {
    isInvoice: true,
    reason: "Has totals - allowing with low confidence",
    invoiceSignalCount,
    usageSignalCount,
    hasLabeledTotal,
  };
}
