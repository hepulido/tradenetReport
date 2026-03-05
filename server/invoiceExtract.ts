/**
 * Enhanced Invoice Extraction Logic
 *
 * Production-grade extraction for invoices with:
 * - Robust total selection with subtotal+tax validation
 * - Vendor extraction with noise removal and anchor detection
 * - Metadata extraction (invoice #, date, PO, job name)
 * - Confidence scoring at each step
 * - LLM fallback with cost controls
 *
 * Environment Variables (see llmClient.ts for full list):
 * - ANTHROPIC_API_KEY: Required for LLM fallback (must start with "sk-ant-")
 * - LLM_MAX_INPUT_CHARS: Max chars sent to LLM (default: 12000)
 * - LLM_MAX_TOKENS: Max response tokens (default: 1200)
 *
 * IMPORTANT: Server must be restarted after setting environment variables!
 */

// Import and re-export LLM errors and config from llmClient
import {
  LLMUnavailableError,
  LLMConfigError,
  getLlmConfig,
  type LlmConfig,
} from "./llmClient";

export {
  LLMUnavailableError,
  LLMConfigError,
  getLlmConfig,
  type LlmConfig,
};

// ========== TYPES ==========

export type ExtractedInvoice = {
  // Core fields
  vendor: string | null;
  vendorConfidence: number;
  vendorReason: string;

  invoiceNumber: string | null;
  invoiceNumberConfidence: number;
  invoiceDate: string | null; // YYYY-MM-DD format
  invoiceDateConfidence: number;
  dueDate: string | null;
  customerPo: string | null;
  jobName: string | null;

  // Totals with validation
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  fees: number | null;
  total: number;
  totalConfidence: number;
  totalReason: string;

  // Debug info
  totalsDebug: TotalsDebugInfo;
  extractionMethod: "deterministic" | "llm_fallback" | "llm_patch";

  // Additional debug fields
  fallbackReasons?: string[];
  finalConfidence?: number;
  reconciliationValid?: boolean;
};

export type TotalsDebugInfo = {
  candidates: TotalCandidate[];
  selectedTotal: TotalCandidate | null;
  subtotalTaxValidation: {
    subtotal: number | null;
    tax: number | null;
    shipping: number | null;
    calculatedTotal: number | null;
    matchesSelected: boolean;
    discrepancy: number | null;
  } | null;
  lineItemRegionPenalties: string[];
  selectionReason: string;
};

export type TotalCandidate = {
  amount: number;
  label: string;
  labelType: "amount_due" | "total_due" | "invoice_total" | "grand_total" | "balance" | "total" | "subtotal" | "tax" | "shipping" | "unknown";
  lineIndex: number;
  matchedLine: string;
  basePriority: number;
  penalties: string[];
  bonuses: string[];
  finalScore: number;
  inLineItemRegion: boolean;
};

// ========== CONSTANTS ==========

// Patterns for total detection with priority scores
const TOTAL_PATTERNS: Array<{ pattern: RegExp; labelType: TotalCandidate["labelType"]; priority: number }> = [
  // Highest priority - explicit payment totals
  { pattern: /\b(?:AMOUNT\s*DUE|TOTAL\s*DUE|BALANCE\s*DUE|AMOUNT\s*OWED)\b/i, labelType: "amount_due", priority: 100 },
  { pattern: /\b(?:PAY\s*THIS\s*AMOUNT|PLEASE\s*PAY|PAYMENT\s*DUE)\b/i, labelType: "total_due", priority: 100 },
  // High priority - invoice totals
  { pattern: /\b(?:INVOICE\s*TOTAL|GRAND\s*TOTAL|TOTAL\s*AMOUNT|NET\s*TOTAL)\b/i, labelType: "grand_total", priority: 95 },
  // Medium-high - Balance patterns
  { pattern: /\b(?:BALANCE|NEW\s*BALANCE|CURRENT\s*BALANCE)\b/i, labelType: "balance", priority: 90 },
  // Medium - generic TOTAL (not SUBTOTAL)
  { pattern: /\bTOTAL\b(?!\s*(?:HOURS|ITEMS|QTY|QUANTITY|UNITS|COUNT|WEIGHT|PIECES|SAVINGS|ORDERED|SHIPPED))/i, labelType: "total", priority: 80 },
  // Lower priority - subtotals
  { pattern: /\bSUBTOTAL\b/i, labelType: "subtotal", priority: 40 },
  // Tax/shipping for validation
  { pattern: /\b(?:TAX|SALES\s*TAX|VAT|GST|HST)\b/i, labelType: "tax", priority: 20 },
  { pattern: /\b(?:SHIPPING|FREIGHT|DELIVERY|HANDLING)\b/i, labelType: "shipping", priority: 15 },
];

// Patterns that indicate we're inside a line-item table (amounts here are NOT totals)
const LINE_ITEM_REGION_PATTERNS = [
  /\b(?:QTY|QUANTITY)\s+/i,
  /\b(?:UNIT\s*PRICE|PRICE\s*EACH)\b/i,
  /\bEXTENDED\b/i,
  /\bAMOUNT\s+(?:QTY|UNIT)/i,
  /^\s*\d+(?:\.\d+)?\s+[A-Z]/i, // Lines starting with qty + product code
];

// Patterns to exclude from total detection
const TOTAL_EXCLUSION_PATTERNS = [
  /\bTOTAL\s*(?:HOURS|ITEMS|QTY|QUANTITY|UNITS|COUNT|WEIGHT|PIECES|LINES?)\b/i,
  /\b(?:HOURS|ITEMS|QTY)\s*TOTAL\b/i,
  /\bPAGE\s*\d+\s*OF\s*\d+\b/i,
  /\bINVOICE\s*(?:#|NO|NUMBER)\s*:?\s*\d/i,
  /\b(?:PO|ORDER)\s*(?:#|NO|NUMBER)\s*:?\s*\d/i,
];

// Noise patterns to filter from vendor detection
const NOISE_PATTERNS = [
  /^[\s\u00A0\u2000-\u200F\u2028-\u202F]+$/, // Whitespace only (including special chars)
  /^[^\w\s]+$/, // Only symbols
  /^\d+$/, // Only numbers
  /^---.*---$/, // File markers
  /^page\s*\d+/i,
  /^[x✓✗◻◼☐☑]+$/, // Checkboxes
  /^[\-_=]+$/, // Lines
  /^branch\s*\d+$/i, // Branch numbers
];

// Label phrases that indicate a line is NOT a vendor name (hard rejections)
const VENDOR_LABEL_PHRASES = [
  /invoice\s*(?:number|#|no\.?|date)/i,
  /due\s*date/i,
  /bill\s*to/i,
  /ship\s*to/i,
  /sold\s*to/i,
  /\bterms\b/i,
  /\bpage\s*\d/i,
  /\bpo\s*(?:#|number)/i,
  /\bcustomer\s*(?:#|id|number)/i,
  /\baccount\s*(?:#|number)/i,
  /\border\s*(?:#|number|date)/i,
  /\bremit\s*to\b/i,
];

// Vendor anchor patterns (search near these)
const VENDOR_ANCHOR_PATTERNS = [
  { pattern: /^\s*(?:FROM|VENDOR|SUPPLIER|SOLD\s*BY|BILL\s*FROM)\s*:?\s*/i, removeLabel: true },
];

// Company suffixes/keywords that indicate a vendor name
const COMPANY_SUFFIXES = /(?:LLC|Inc\.?|Corp\.?|Ltd\.?|Co\.?|Company|Corporation|Services|Supply|Materials|Distributors?|Wholesale|Industries|Building|Construction|Electric(?:al)?|Plumbing|HVAC)\b/i;

// Valid invoice number patterns (order matters - more specific patterns first)
const INVOICE_NUMBER_PATTERNS = [
  /\b([A-Z]{2,4}-\d{4,}(?:-\d+)?)\b/i, // e.g., INV-88321, FBM-2024-001
  /\b([A-Z]{2,4}\d{4,}(?:-\d+)?)\b/i, // e.g., INV88321 (no hyphen after prefix)
  /\b(\d{6,}(?:-\d{2,})?)\b/, // e.g., 120040985-00 or 120040985 (at least 6 digits)
  /\b([A-Z0-9][A-Z0-9\-]{4,}[A-Z0-9])\b/, // e.g., ABC-123-DEF (at least 6 chars)
];

// Hard rejection list for junk vendor names (exact or contains match)
const VENDOR_HARD_REJECT_PHRASES = [
  "return service requested",
  "invoice number invoice date",
  "invoice date due date",
  "presorted standard",
  "us postage paid",
  "first class mail",
  "address service requested",
  "forwarding service requested",
  "electronic service requested",
  "change service requested",
  "nonprofit org",
  "prsrt std",
  "permit no",
];

// ========== HELPER FUNCTIONS ==========

/**
 * Extract currency amounts from a line
 */
function extractAmounts(line: string): number[] {
  const amounts: number[] = [];
  // Match: $1,234.56 or 1234.56 or 1,234
  const pattern = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const cleaned = match[1].replace(/,/g, "");
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) {
      amounts.push(num);
    }
  }
  return amounts;
}

/**
 * Check if a line is inside a line-item table region
 */
function isLineItemRegion(line: string, contextLines: string[]): boolean {
  // Check the line itself
  for (const pattern of LINE_ITEM_REGION_PATTERNS) {
    if (pattern.test(line)) return true;
  }
  return false;
}

/**
 * Detect line-item table boundaries in the document
 */
function findLineItemRegion(lines: string[]): { start: number; end: number } | null {
  let start = -1;
  let end = -1;

  // Find table header
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const headerKeywords = ["qty", "quantity", "description", "item", "price", "amount", "unit"];
    const keywordCount = headerKeywords.filter(kw => line.includes(kw)).length;
    if (keywordCount >= 2) {
      start = i;
      break;
    }
  }

  if (start === -1) return null;

  // Find table end (subtotal/total)
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:sub\s*)?total\b/i.test(line) || /^\s*tax(?:es)?\b/i.test(line)) {
      end = i;
      break;
    }
  }

  if (end === -1) end = Math.min(start + 50, lines.length - 1);

  return { start, end };
}

/**
 * Clean a vendor name by removing noise
 * Validates that vendor is a reasonable business name, not OCR junk
 */
function cleanVendorName(name: string): string | null {
  if (!name) return null;

  // Remove leading/trailing whitespace and special chars
  let cleaned = name.trim()
    .replace(/^[\s\u00A0\u2000-\u200F\u2028-\u202F\-_:]+/, "")
    .replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F\-_:]+$/, "")
    // Remove non-printable characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ");

  // Check if it's just noise
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(cleaned)) return null;
  }

  // HARD REJECTION: Known junk vendor phrases
  const lowerCleaned = cleaned.toLowerCase();
  for (const phrase of VENDOR_HARD_REJECT_PHRASES) {
    if (lowerCleaned.includes(phrase)) return null;
  }

  // HARD REJECTION: Contains label phrases (invoice number, due date, etc.)
  for (const labelPattern of VENDOR_LABEL_PHRASES) {
    if (labelPattern.test(cleaned)) return null;
  }

  // Count label keywords - reject if line has >=3 label keywords
  const labelKeywords = ["invoice", "number", "date", "due", "bill", "ship", "sold", "to", "terms", "page", "po", "order", "account", "customer"];
  const keywordCount = labelKeywords.filter(kw => lowerCleaned.includes(kw)).length;
  if (keywordCount >= 3) return null;

  // Must have at least 2 characters
  if (cleaned.length < 2) return null;

  // Must have at least one letter
  if (!/[a-zA-Z]/.test(cleaned)) return null;

  // Reject strings where >30% of characters are non-letter/digit/space (junk detection)
  const validChars = cleaned.replace(/[^a-zA-Z0-9\s]/g, "").length;
  const junkRatio = 1 - (validChars / cleaned.length);
  if (junkRatio > 0.3) {
    return null; // Too many symbols/special characters
  }

  // Reject if string is mostly whitespace
  if (cleaned.replace(/\s/g, "").length < 2) return null;

  return cleaned;
}

// ========== MAIN EXTRACTION FUNCTIONS ==========

/**
 * Select the best invoice total with comprehensive scoring
 */
export function selectInvoiceTotal(
  text: string,
  existingCandidates?: number[]
): { total: number; confidence: number; reason: string; debug: TotalsDebugInfo } {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const lineItemRegion = findLineItemRegion(lines);
  const candidates: TotalCandidate[] = [];
  const lineItemRegionPenalties: string[] = [];

  // First pass: find all labeled amounts
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip exclusion patterns
    let excluded = false;
    for (const pattern of TOTAL_EXCLUSION_PATTERNS) {
      if (pattern.test(line)) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    // Check each total pattern
    for (const { pattern, labelType, priority } of TOTAL_PATTERNS) {
      if (pattern.test(line)) {
        let amounts = extractAmounts(line);

        // If no amount on this line, check next line
        if (amounts.length === 0 && i + 1 < lines.length) {
          amounts = extractAmounts(lines[i + 1]);
        }

        // Check if in line-item region
        const inLineItemRegion = lineItemRegion !== null &&
          i >= lineItemRegion.start && i <= lineItemRegion.end;

        for (const amount of amounts) {
          const penalties: string[] = [];
          const bonuses: string[] = [];
          let score = priority;

          // ========== PENALTIES ==========

          // Heavy penalty for tiny amounts (likely quantities)
          if (amount < 10) {
            penalties.push(`tiny_amount(<10)=-80`);
            score -= 80;
          } else if (amount < 50) {
            penalties.push(`small_amount(<50)=-30`);
            score -= 30;
          }

          // Penalty for amounts in line-item region
          if (inLineItemRegion && labelType !== "subtotal" && labelType !== "total") {
            penalties.push(`in_line_item_region=-40`);
            score -= 40;
            lineItemRegionPenalties.push(`$${amount} at line ${i}`);
          }

          // Penalty for subtotals when we're looking for total
          if (labelType === "subtotal") {
            penalties.push(`is_subtotal=-20`);
            score -= 20;
          }

          // ========== BONUSES ==========

          // Bonus for amounts with cents
          if (amount !== Math.floor(amount)) {
            bonuses.push(`has_cents=+5`);
            score += 5;
          }

          // Bonus for reasonable invoice range
          if (amount >= 100 && amount <= 100000) {
            bonuses.push(`reasonable_range=+15`);
            score += 15;
          }

          // Bonus for high-priority labels
          if (labelType === "amount_due" || labelType === "total_due") {
            bonuses.push(`high_priority_label=+10`);
            score += 10;
          }

          candidates.push({
            amount,
            label: line.slice(0, 60),
            labelType,
            lineIndex: i,
            matchedLine: line.slice(0, 80),
            basePriority: priority,
            penalties,
            bonuses,
            finalScore: score,
            inLineItemRegion,
          });
        }
        break; // Only match first pattern per line
      }
    }
  }

  // Sort by final score
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  // Find subtotal, tax, shipping for validation
  let subtotal: number | null = null;
  let tax: number | null = null;
  let shipping: number | null = null;

  for (const c of candidates) {
    if (c.labelType === "subtotal" && subtotal === null) subtotal = c.amount;
    if (c.labelType === "tax" && tax === null) tax = c.amount;
    if (c.labelType === "shipping" && shipping === null) shipping = c.amount;
  }

  // Calculate expected total from components
  let calculatedTotal: number | null = null;
  let subtotalTaxValidation: TotalsDebugInfo["subtotalTaxValidation"] = null;

  if (subtotal !== null) {
    calculatedTotal = subtotal + (tax || 0) + (shipping || 0);
    subtotalTaxValidation = {
      subtotal,
      tax,
      shipping,
      calculatedTotal,
      matchesSelected: false,
      discrepancy: null,
    };
  }

  // Select best candidate
  let selectedTotal: TotalCandidate | null = null;
  let selectionReason = "";

  // STRATEGY 1: Prefer labeled totals (TOTAL, AMOUNT DUE, BALANCE DUE, etc.)
  const labeledTotals = candidates.filter(
    c => c.finalScore > 0 &&
      c.labelType !== "subtotal" &&
      c.labelType !== "tax" &&
      c.labelType !== "shipping" &&
      c.amount >= 10 // Filter out tiny amounts
  );

  if (labeledTotals.length > 0) {
    selectedTotal = labeledTotals[0]; // Already sorted by score

    // Validate against calculated total
    if (calculatedTotal !== null) {
      const discrepancy = Math.abs(selectedTotal.amount - calculatedTotal);
      const tolerance = Math.max(0.05, calculatedTotal * 0.005); // ±0.05 or 0.5% whichever is larger

      if (subtotalTaxValidation) {
        subtotalTaxValidation.discrepancy = discrepancy;
        subtotalTaxValidation.matchesSelected = discrepancy <= tolerance;
      }

      if (discrepancy <= tolerance) {
        selectionReason = `Selected ${selectedTotal.labelType} $${selectedTotal.amount} (validated: subtotal ${subtotal} + tax ${tax || 0} + shipping ${shipping || 0} = ${calculatedTotal})`;
      } else {
        selectionReason = `Selected ${selectedTotal.labelType} $${selectedTotal.amount} (score=${selectedTotal.finalScore})`;
      }
    } else {
      selectionReason = `Selected ${selectedTotal.labelType} $${selectedTotal.amount} (score=${selectedTotal.finalScore})`;
    }
  }

  // STRATEGY 2: If no labeled total, try reconciliation (subtotal + tax + shipping)
  if (!selectedTotal && calculatedTotal !== null && calculatedTotal >= 10) {
    // Look for an amount that matches the calculated total within ±0.05
    for (const c of candidates) {
      if (c.labelType !== "subtotal" && c.labelType !== "tax" && c.labelType !== "shipping") {
        const discrepancy = Math.abs(c.amount - calculatedTotal);
        if (discrepancy <= 0.05) {
          selectedTotal = c;
          selectionReason = `Reconciled: subtotal ${subtotal} + tax ${tax || 0} + shipping ${shipping || 0} = $${calculatedTotal} (matched $${c.amount})`;
          if (subtotalTaxValidation) {
            subtotalTaxValidation.matchesSelected = true;
            subtotalTaxValidation.discrepancy = discrepancy;
          }
          break;
        }
      }
    }

    // If no exact match found, use calculated total directly
    if (!selectedTotal) {
      selectedTotal = {
        amount: calculatedTotal,
        label: "reconciled",
        labelType: "total",
        lineIndex: -1,
        matchedLine: `Calculated: ${subtotal} + ${tax || 0} + ${shipping || 0}`,
        basePriority: 85,
        penalties: [],
        bonuses: ["reconciled_from_components"],
        finalScore: 85,
        inLineItemRegion: false,
      };
      selectionReason = `Reconciled total: subtotal ${subtotal} + tax ${tax || 0} + shipping ${shipping || 0} = $${calculatedTotal}`;
      if (subtotalTaxValidation) {
        subtotalTaxValidation.matchesSelected = true;
        subtotalTaxValidation.discrepancy = 0;
      }
    }
  }

  // STRATEGY 3: Fallback to largest reasonable currency amount (not in line-item region)
  if (!selectedTotal) {
    // Scan all lines for currency amounts, prefer amounts near the end of document
    const allAmounts: { amount: number; lineIndex: number; line: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip line-item region
      if (lineItemRegion && i >= lineItemRegion.start && i <= lineItemRegion.end) continue;
      // Skip header lines (first 5)
      if (i < 5) continue;

      const amounts = extractAmounts(line);
      for (const amount of amounts) {
        // Only consider reasonable invoice amounts
        if (amount >= 50 && amount <= 500000) {
          allAmounts.push({ amount, lineIndex: i, line });
        }
      }
    }

    if (allAmounts.length > 0) {
      // Prefer amounts in the last third of the document (where totals usually are)
      const lastThirdStart = Math.floor(lines.length * 0.66);
      const lastThirdAmounts = allAmounts.filter(a => a.lineIndex >= lastThirdStart);

      // Pick the largest amount from last third, or overall largest
      const candidates = lastThirdAmounts.length > 0 ? lastThirdAmounts : allAmounts;
      const largest = candidates.sort((a, b) => b.amount - a.amount)[0];

      selectedTotal = {
        amount: largest.amount,
        label: "fallback_largest",
        labelType: "unknown",
        lineIndex: largest.lineIndex,
        matchedLine: largest.line.slice(0, 80),
        basePriority: 30,
        penalties: ["fallback_no_label"],
        bonuses: largest.lineIndex >= lastThirdStart ? ["near_end_of_doc"] : [],
        finalScore: 30,
        inLineItemRegion: false,
      };
      selectionReason = `Fallback: largest amount $${largest.amount} at line ${largest.lineIndex}`;
    }
  }

  // STRATEGY 4: Use existing candidates as last resort
  if (!selectedTotal && existingCandidates && existingCandidates.length > 0) {
    const best = existingCandidates.sort((a, b) => b - a)[0];
    selectedTotal = {
      amount: best,
      label: "from_existing",
      labelType: "unknown",
      lineIndex: -1,
      matchedLine: "",
      basePriority: 0,
      penalties: ["from_existing_candidates"],
      bonuses: [],
      finalScore: 10,
      inLineItemRegion: false,
    };
    selectionReason = `Fallback to existing candidate $${best}`;
  }

  // Calculate confidence
  let confidence = 0;
  if (selectedTotal) {
    confidence = Math.min(1, Math.max(0, selectedTotal.finalScore / 100));

    // Boost confidence if validated
    if (subtotalTaxValidation?.matchesSelected) {
      confidence = Math.min(1, confidence + 0.2);
    }

    // Reduce confidence for fallback selections
    if (selectedTotal.labelType === "subtotal" || selectedTotal.labelType === "unknown") {
      confidence *= 0.7;
    }
  }

  return {
    total: selectedTotal?.amount || 0,
    confidence: Math.round(confidence * 100) / 100,
    reason: selectionReason || "No total found",
    debug: {
      candidates: candidates.slice(0, 10),
      selectedTotal,
      subtotalTaxValidation,
      lineItemRegionPenalties,
      selectionReason,
    },
  };
}

/**
 * Check if a line looks like an address
 */
function isAddressLine(line: string): boolean {
  // Street address patterns
  if (/^\d+\s+\w+\s+(?:st(?:reet)?|ave(?:nue)?|rd|road|blvd|boulevard|dr(?:ive)?|lane|ln|way|court|ct|place|pl|circle|cir)\b/i.test(line)) return true;
  // City, State ZIP
  if (/\b[A-Z][a-z]+,?\s+[A-Z]{2}\s+\d{5}/i.test(line)) return true;
  // PO Box
  if (/\bp\.?o\.?\s*box\s+\d+/i.test(line)) return true;
  return false;
}

/**
 * Extract vendor name with noise removal and anchor detection
 */
export function extractVendor(text: string): { vendor: string | null; confidence: number; reason: string } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const topLines = lines.slice(0, 30); // Only look at first 30 lines

  // Collect valid vendor candidates with scores
  type VendorCandidate = { name: string; lineIndex: number; score: number; reason: string };
  const candidates: VendorCandidate[] = [];

  // First pass: look for labeled vendor lines (FROM:, VENDOR:, etc.)
  for (let i = 0; i < topLines.length; i++) {
    const line = topLines[i];

    for (const anchor of VENDOR_ANCHOR_PATTERNS) {
      const match = line.match(anchor.pattern);
      if (match) {
        let vendorName: string | null = null;

        if (anchor.removeLabel) {
          vendorName = line.slice(match[0].length).trim();
        }

        vendorName = cleanVendorName(vendorName || "");
        if (vendorName && vendorName.length >= 2 && vendorName.length <= 80) {
          candidates.push({
            name: vendorName,
            lineIndex: i,
            score: 100, // Highest priority for labeled vendors
            reason: `Found near anchor: "${match[0].trim()}"`,
          });
        }
      }
    }
  }

  // Second pass: look for business-name lines in first 10 lines
  for (let i = 0; i < Math.min(10, topLines.length); i++) {
    const line = topLines[i];
    const cleaned = cleanVendorName(line);
    if (!cleaned) continue;

    // Skip common header words that are NOT vendor names
    if (/^(?:INVOICE|BILL|STATEMENT|RECEIPT|ORDER|QUOTE|ESTIMATE|PAGE|TOTAL)$/i.test(cleaned)) continue;

    // Skip address-like lines
    if (isAddressLine(cleaned)) continue;

    // Skip phone/fax/email lines
    if (/^\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/.test(cleaned)) continue;
    if (/\b(?:tel|fax|phone|email)\s*:/i.test(cleaned)) continue;

    // Skip lines that are mostly numbers (dates, invoice numbers)
    const digitRatio = (cleaned.match(/\d/g) || []).length / cleaned.length;
    if (digitRatio > 0.5) continue;

    let score = 50 - i * 3; // Base score decreases with line position

    // Boost for company suffixes/keywords
    if (COMPANY_SUFFIXES.test(cleaned)) {
      score += 40;
    }

    // Boost for being in first 3 lines
    if (i < 3) {
      score += 15;
    }

    // Boost for looking like a proper business name (starts with capital, multiple words)
    if (/^[A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]+)+$/.test(cleaned)) {
      score += 10;
    }

    if (score > 30) {
      candidates.push({
        name: cleaned,
        lineIndex: i,
        score,
        reason: COMPANY_SUFFIXES.test(cleaned)
          ? `Found company keyword in header line ${i}`
          : `Header line ${i}`,
      });
    }
  }

  // Sort by score descending, then by line index ascending (prefer earlier lines for ties)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.lineIndex - b.lineIndex;
  });

  if (candidates.length > 0) {
    const best = candidates[0];
    const confidence = Math.min(0.95, best.score / 100);
    return {
      vendor: best.name,
      confidence,
      reason: best.reason,
    };
  }

  return { vendor: null, confidence: 0, reason: "No vendor found" };
}

/**
 * Validate invoice number format
 * Must match patterns like: 120040985-00, INV12345, FBM-2024-001
 */
function isValidInvoiceNumber(value: string): boolean {
  if (!value || value.length < 4) return false;

  // Reject common false positives
  const lowerValue = value.toLowerCase();
  if (["invoice", "number", "date", "oice", "umber"].includes(lowerValue)) return false;
  if (/^[a-z]+$/i.test(value) && value.length < 6) return false; // Pure short words

  // Must match one of our valid patterns
  for (const pattern of INVOICE_NUMBER_PATTERNS) {
    if (pattern.test(value)) return true;
  }

  return false;
}

/**
 * Extract invoice number using anchor-based approach
 */
function extractInvoiceNumber(text: string): string | null {
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for "Invoice Number", "Invoice #", "Invoice No", "Inv #" labels
    const labelMatch = line.match(/(?:invoice|inv)[\s]*(?:number|#|no\.?)[\s]*:?/i);
    if (labelMatch) {
      // Try to find value on same line after the label
      const afterLabel = line.slice(labelMatch.index! + labelMatch[0].length).trim();

      // Look for valid invoice number pattern in the remainder
      for (const pattern of INVOICE_NUMBER_PATTERNS) {
        const match = afterLabel.match(pattern);
        if (match && isValidInvoiceNumber(match[1])) {
          return match[1];
        }
      }

      // If same line doesn't have it, check next line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        for (const pattern of INVOICE_NUMBER_PATTERNS) {
          const match = nextLine.match(pattern);
          if (match && isValidInvoiceNumber(match[1])) {
            return match[1];
          }
        }
      }
    }

    // Also try format: "Invoice Number: INV-88321" or "Invoice Number    120040985-00"
    // Capture alphanumeric invoice numbers with optional prefix
    const singleLineMatch = line.match(/(?:invoice|inv)[\s]*(?:number|#|no\.?)?[\s:]+([A-Z]{0,4}-?\d{4,}(?:-\d+)?)/i);
    if (singleLineMatch && isValidInvoiceNumber(singleLineMatch[1])) {
      return singleLineMatch[1];
    }
  }

  return null;
}

/**
 * Extract invoice date using anchor-based approach
 * Similar to invoice number extraction
 */
function extractInvoiceDateAnchored(text: string): { invoiceDate: string | null; confidence: number } {
  const lines = text.split(/\r?\n/);

  // Date label patterns (order by specificity)
  const dateLabelPatterns = [
    /(?:invoice\s*date|inv\s*date)\s*:?\s*/i,
    /\bdate\s*:?\s*(?!due)/i,
  ];

  // Date value patterns
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/, // YYYY-MM-DD (ISO)
    /(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/, // MM/DD/YYYY or DD/MM/YYYY
    /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2})/, // MM/DD/YY or DD/MM/YY
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines that are clearly "Due Date" lines
    if (/due\s*date/i.test(line) && !/invoice\s*date/i.test(line)) continue;

    for (const labelPattern of dateLabelPatterns) {
      const labelMatch = line.match(labelPattern);
      if (labelMatch) {
        // Try to find date value on same line after the label
        const afterLabel = line.slice(labelMatch.index! + labelMatch[0].length).trim();

        for (const datePattern of datePatterns) {
          const dateMatch = afterLabel.match(datePattern);
          if (dateMatch) {
            const parsed = parseDate(dateMatch[1]);
            if (parsed && isValidDate(parsed)) {
              return { invoiceDate: parsed, confidence: 0.9 };
            }
          }
        }

        // If same line doesn't have it, check next line
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          for (const datePattern of datePatterns) {
            const dateMatch = nextLine.match(datePattern);
            if (dateMatch) {
              const parsed = parseDate(dateMatch[1]);
              if (parsed && isValidDate(parsed)) {
                return { invoiceDate: parsed, confidence: 0.85 };
              }
            }
          }
        }
      }
    }
  }

  // Fallback: look for any date-like pattern in first 30 lines
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const line = lines[i];
    // Skip due date lines
    if (/due/i.test(line)) continue;

    for (const datePattern of datePatterns) {
      const dateMatch = line.match(datePattern);
      if (dateMatch) {
        const parsed = parseDate(dateMatch[1]);
        if (parsed && isValidDate(parsed)) {
          return { invoiceDate: parsed, confidence: 0.5 };
        }
      }
    }
  }

  return { invoiceDate: null, confidence: 0 };
}

/**
 * Validate a date is reasonable (not too far in past/future)
 */
function isValidDate(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [year, month, day] = dateStr.split("-").map(Number);

  // Basic validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Year reasonability check (1990 to 10 years in future)
  const currentYear = new Date().getFullYear();
  if (year < 1990 || year > currentYear + 10) return false;

  return true;
}

/**
 * Extract invoice metadata (number, date, PO, job name)
 */
export function extractInvoiceMetadata(text: string): {
  invoiceNumber: string | null;
  invoiceNumberConfidence: number;
  invoiceDate: string | null;
  invoiceDateConfidence: number;
  dueDate: string | null;
  customerPo: string | null;
  jobName: string | null;
} {
  const lines = text.split(/\r?\n/);

  // Use anchor-based extraction for invoice number
  const invoiceNumber = extractInvoiceNumber(text);
  const invoiceNumberConfidence = invoiceNumber && isValidInvoiceNumber(invoiceNumber) ? 0.9 : 0;

  // Use anchor-based extraction for invoice date
  const dateResult = extractInvoiceDateAnchored(text);

  let dueDate: string | null = null;
  let customerPo: string | null = null;
  let jobName: string | null = null;

  for (const line of lines) {
    // Due date
    if (!dueDate) {
      const dueMatch = line.match(/due\s*(?:date)?\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
      if (dueMatch) {
        dueDate = parseDate(dueMatch[1]);
      }
    }

    // Customer PO
    if (!customerPo) {
      const poMatch = line.match(/(?:po|p\.o\.|purchase\s*order|customer\s*po)\s*(?:#|no\.?)?\s*:?\s*([A-Z0-9\-]+)/i);
      if (poMatch && poMatch[1].length >= 3) {
        customerPo = poMatch[1].trim();
      }
    }

    // Job name
    if (!jobName) {
      const jobMatch = line.match(/(?:job|project|site)\s*(?:name|#|no\.?)?\s*:?\s*(.+?)(?:$|date|po)/i);
      if (jobMatch) {
        const candidate = jobMatch[1].trim();
        if (candidate.length >= 3 && candidate.length <= 80) {
          jobName = candidate;
        }
      }
    }
  }

  return {
    invoiceNumber,
    invoiceNumberConfidence,
    invoiceDate: dateResult.invoiceDate,
    invoiceDateConfidence: dateResult.confidence,
    dueDate,
    customerPo,
    jobName,
  };
}

/**
 * Parse a date string to YYYY-MM-DD format
 */
function parseDate(dateStr: string): string | null {
  // Handle MM/DD/YYYY, MM-DD-YYYY, DD/MM/YYYY patterns
  const parts = dateStr.split(/[\/-]/);
  if (parts.length !== 3) return null;

  let month: number, day: number, year: number;

  // Assume MM/DD/YYYY for US invoices
  if (parseInt(parts[0]) <= 12) {
    month = parseInt(parts[0]);
    day = parseInt(parts[1]);
    year = parseInt(parts[2]);
  } else {
    // DD/MM/YYYY
    day = parseInt(parts[0]);
    month = parseInt(parts[1]);
    year = parseInt(parts[2]);
  }

  // Handle 2-digit years
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Main extraction function - combines all extraction logic
 */
export function extractInvoiceData(text: string): ExtractedInvoice {
  // Extract vendor
  const vendorResult = extractVendor(text);

  // Extract totals
  const totalResult = selectInvoiceTotal(text);

  // Extract metadata
  const metadata = extractInvoiceMetadata(text);

  // Get subtotal/tax from debug
  const subtotal = totalResult.debug.subtotalTaxValidation?.subtotal || null;
  const tax = totalResult.debug.subtotalTaxValidation?.tax || null;
  const shipping = totalResult.debug.subtotalTaxValidation?.shipping || null;

  // Check for fees (often labeled as "Other", "Fee", "Service Charge")
  const fees = extractFees(text);

  // Calculate reconciliation validity
  const reconciliationValid = checkReconciliation(subtotal, tax, shipping, fees, totalResult.total);

  // Calculate final confidence as minimum of key confidences
  const finalConfidence = Math.min(
    vendorResult.confidence,
    metadata.invoiceNumberConfidence || 0.5,
    metadata.invoiceDateConfidence || 0.5,
    totalResult.confidence
  );

  return {
    vendor: vendorResult.vendor,
    vendorConfidence: vendorResult.confidence,
    vendorReason: vendorResult.reason,

    invoiceNumber: metadata.invoiceNumber,
    invoiceNumberConfidence: metadata.invoiceNumberConfidence,
    invoiceDate: metadata.invoiceDate,
    invoiceDateConfidence: metadata.invoiceDateConfidence,
    dueDate: metadata.dueDate,
    customerPo: metadata.customerPo,
    jobName: metadata.jobName,

    subtotal,
    tax,
    shipping,
    fees,
    total: totalResult.total,
    totalConfidence: totalResult.confidence,
    totalReason: totalResult.reason,

    totalsDebug: totalResult.debug,
    extractionMethod: "deterministic",
    reconciliationValid,
    finalConfidence,
  };
}

/**
 * Extract fees/other charges from text
 */
function extractFees(text: string): number | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const feeMatch = line.match(/(?:fee|other|service\s*charge|handling)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
    if (feeMatch) {
      const amount = parseFloat(feeMatch[1].replace(/,/g, ""));
      if (!isNaN(amount) && amount > 0 && amount < 10000) {
        return amount;
      }
    }
  }
  return null;
}

/**
 * Check if totals reconcile properly
 */
function checkReconciliation(
  subtotal: number | null,
  tax: number | null,
  shipping: number | null,
  fees: number | null,
  total: number
): boolean {
  if (subtotal === null) return true; // Can't check without subtotal

  const calculated = subtotal + (tax || 0) + (shipping || 0) + (fees || 0);
  const tolerance = Math.max(1.00, total * 0.01); // max of $1 or 1%

  return Math.abs(calculated - total) <= tolerance;
}

/**
 * Check if vendor looks like a label line (not a real business name)
 */
function isVendorLabelLike(vendor: string | null): boolean {
  if (!vendor) return true;

  const lowerVendor = vendor.toLowerCase();

  // HARD REJECTION: Known junk phrases
  for (const phrase of VENDOR_HARD_REJECT_PHRASES) {
    if (lowerVendor.includes(phrase)) return true;
  }

  // Label phrases that should never be in a vendor name
  const labelPhrases = [
    "invoice number", "invoice date", "invoice #",
    "due date", "bill to", "ship to", "sold to",
    "terms", "page", "remit to", "customer",
    "account", "order date", "po number", "po #",
  ];

  for (const phrase of labelPhrases) {
    if (lowerVendor.includes(phrase)) return true;
  }

  // Too many label-like words (max 1 allowed)
  const labelWords = ["invoice", "number", "date", "due", "bill", "ship", "sold", "terms", "page", "po", "order", "account"];
  const wordCount = labelWords.filter(w => lowerVendor.includes(w)).length;
  if (wordCount >= 2) return true;

  // Must contain at least one alphabetic word (not just symbols/numbers)
  const hasAlphaWord = /[a-zA-Z]{2,}/.test(vendor);
  if (!hasAlphaWord) return true;

  return false;
}

/**
 * Check if OCR text has table header signals indicating line items should exist
 */
function hasLineItemTableSignals(ocrText: string): boolean {
  const lower = ocrText.toLowerCase();

  // Must have qty/quantity indicator
  const hasQty = /\b(?:qty|quantity)\b/.test(lower);

  // Must have description indicator
  const hasDesc = /\b(?:description|item|product)\b/.test(lower);

  // Must have amount/price indicator
  const hasAmount = /\b(?:amount|unit\s*price|price|extended|total)\b/.test(lower);

  return hasQty && hasDesc && hasAmount;
}

/**
 * Enhanced evaluation of whether deterministic extraction needs LLM fallback
 * Implements comprehensive confidence gates
 */
export function needsLLMFallback(
  extraction: ExtractedInvoice,
  lineItemCount: number,
  ocrText: string = ""
): {
  fallback: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // ========== VENDOR GATES ==========
  if (!extraction.vendor) {
    reasons.push("Vendor missing");
  } else if (extraction.vendorConfidence < 0.75) {
    reasons.push(`Low vendor confidence: ${extraction.vendorConfidence.toFixed(2)}`);
  } else if (isVendorLabelLike(extraction.vendor)) {
    reasons.push(`Vendor looks like label line: "${extraction.vendor}"`);
  } else if (extraction.vendor.length < 4) {
    reasons.push(`Vendor too short: "${extraction.vendor}"`);
  }

  // ========== INVOICE NUMBER GATES ==========
  if (!extraction.invoiceNumber) {
    reasons.push("Invoice number missing");
  } else if ((extraction.invoiceNumberConfidence || 0) < 0.7) {
    reasons.push(`Low invoice number confidence: ${extraction.invoiceNumberConfidence?.toFixed(2) || 0}`);
  }

  // ========== TOTAL GATES ==========
  if (!extraction.total || extraction.total <= 0) {
    reasons.push("Total missing or zero");
  } else if (extraction.totalConfidence < 0.8) {
    reasons.push(`Low total confidence: ${extraction.totalConfidence.toFixed(2)}`);
  } else if (extraction.total < 10) {
    reasons.push(`Suspiciously low total: $${extraction.total}`);
  }

  // ========== RECONCILIATION CHECK ==========
  if (extraction.subtotal !== null && extraction.total > 0) {
    const calculated = extraction.subtotal +
      (extraction.tax || 0) +
      (extraction.shipping || 0) +
      (extraction.fees || 0);
    const tolerance = Math.max(1.00, extraction.total * 0.01);
    const discrepancy = Math.abs(calculated - extraction.total);

    if (discrepancy > tolerance) {
      reasons.push(`Reconciliation failed: calculated $${calculated.toFixed(2)} vs total $${extraction.total.toFixed(2)} (diff: $${discrepancy.toFixed(2)})`);
    }
  }

  // ========== LINE ITEM GATES ==========
  if (ocrText && hasLineItemTableSignals(ocrText) && lineItemCount === 0) {
    reasons.push("Table headers found but no line items extracted");
  }

  // ========== INVOICE DATE GATES ==========
  if (!extraction.invoiceDate) {
    reasons.push("Invoice date missing");
  } else if ((extraction.invoiceDateConfidence || 0) < 0.5) {
    reasons.push(`Low invoice date confidence: ${extraction.invoiceDateConfidence?.toFixed(2) || 0}`);
  } else if (!isValidDate(extraction.invoiceDate)) {
    reasons.push(`Invalid invoice date: ${extraction.invoiceDate}`);
  }

  return {
    fallback: reasons.length > 0,
    reasons,
  };
}

// Keep old function name for backward compatibility
export function needsLlmFallback(extraction: ExtractedInvoice, lineItemCount: number): {
  needsLlm: boolean;
  reasons: string[];
} {
  const result = needsLLMFallback(extraction, lineItemCount, "");
  return {
    needsLlm: result.fallback,
    reasons: result.reasons,
  };
}

// ========== LLM FALLBACK EXTRACTION ==========

/**
 * LLM extraction result structure
 */
type LlmExtractionResult = {
  vendor: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  customerPo: string | null;
  jobName: string | null;
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  total: number | null;
  lineItems: Array<{
    productCode: string | null;
    description: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    lineAmount: number | null;
  }>;
};

/**
 * Build the prompt for LLM invoice extraction (full extraction mode)
 */
function buildLlmExtractionPrompt(ocrText: string): string {
  return `You are an expert at extracting structured data from invoice OCR text.

Extract the following information from this invoice text. Return ONLY valid JSON with no additional text or explanation.

INVOICE TEXT:
---
${ocrText.slice(0, 8000)}
---

Extract and return this JSON structure:
{
  "vendor": "vendor/company name at the top of invoice",
  "invoiceNumber": "invoice number",
  "invoiceDate": "YYYY-MM-DD format",
  "dueDate": "YYYY-MM-DD format or null",
  "customerPo": "customer PO/purchase order number or null",
  "jobName": "job/project name or null",
  "subtotal": 123.45,
  "tax": 12.34,
  "shipping": 5.00,
  "total": 140.79,
  "lineItems": [
    {
      "productCode": "ABC123",
      "description": "Item description",
      "quantity": 5,
      "unit": "EA",
      "unitPrice": 10.00,
      "lineAmount": 50.00
    }
  ]
}

Rules:
- Numbers should be plain numbers, not strings with currency symbols
- Dates must be in YYYY-MM-DD format
- If a field cannot be determined, use null
- "total" is the final amount due (AMOUNT DUE, INVOICE TOTAL, BALANCE DUE)
- "subtotal" is the pre-tax/pre-shipping amount
- Include ALL line items you can extract from the invoice
- Return ONLY the JSON, no markdown, no explanation`;
}

/**
 * Build the prompt for LLM invoice extraction (PATCH mode)
 * Only asks LLM to fill/correct specific fields that failed deterministic extraction
 */
function buildLlmPatchPrompt(
  ocrText: string,
  deterministicResult: ExtractedInvoice,
  failureReasons: string[]
): string {
  // Determine which fields need patching
  const needsVendor = !deterministicResult.vendor ||
    deterministicResult.vendorConfidence < 0.75 ||
    isVendorLabelLike(deterministicResult.vendor);
  const needsInvoiceNumber = !deterministicResult.invoiceNumber ||
    (deterministicResult.invoiceNumberConfidence || 0) < 0.7;
  const needsInvoiceDate = !deterministicResult.invoiceDate ||
    (deterministicResult.invoiceDateConfidence || 0) < 0.5;
  const needsTotal = !deterministicResult.total ||
    deterministicResult.total < 10 ||
    deterministicResult.totalConfidence < 0.8;
  const needsLineItems = failureReasons.some(r => r.includes("line items"));

  const fieldsToExtract: string[] = [];
  if (needsVendor) fieldsToExtract.push('"vendor": "company/business name at top of invoice (NOT labels like Invoice Number, Date, etc.)"');
  if (needsInvoiceNumber) fieldsToExtract.push('"invoiceNumber": "the invoice number/ID"');
  if (needsInvoiceDate) fieldsToExtract.push('"invoiceDate": "YYYY-MM-DD format"');
  if (needsTotal) {
    fieldsToExtract.push('"subtotal": numeric_value');
    fieldsToExtract.push('"tax": numeric_value');
    fieldsToExtract.push('"shipping": numeric_value_or_null');
    fieldsToExtract.push('"total": numeric_value (the AMOUNT DUE / INVOICE TOTAL)');
  }
  if (needsLineItems) {
    fieldsToExtract.push('"lineItems": [{"productCode": "...", "description": "...", "quantity": N, "unit": "EA", "unitPrice": N, "lineAmount": N}]');
  }

  return `You are an expert at extracting structured data from invoice OCR text.

The deterministic extraction had issues with these fields:
${failureReasons.map(r => `- ${r}`).join('\n')}

Current extraction (some fields may be wrong/missing):
- vendor: ${deterministicResult.vendor || "NOT FOUND"}
- invoiceNumber: ${deterministicResult.invoiceNumber || "NOT FOUND"}
- invoiceDate: ${deterministicResult.invoiceDate || "NOT FOUND"}
- total: ${deterministicResult.total || "NOT FOUND"}

INVOICE TEXT:
---
${ocrText.slice(0, 8000)}
---

Extract ONLY the fields that need correction. Return ONLY valid JSON:
{
  ${fieldsToExtract.join(',\n  ')}
}

Rules:
- The vendor is the BUSINESS NAME at the top of the invoice, NOT labels like "Invoice Number", "Invoice Date", etc.
- Numbers should be plain numbers without currency symbols
- Dates must be YYYY-MM-DD format
- If you cannot determine a field, use null
- "total" is the final AMOUNT DUE or INVOICE TOTAL
- Return ONLY the JSON, no markdown, no explanation`;
}

/**
 * Parse LLM response to extraction result
 */
function parseLlmResponse(response: string): LlmExtractionResult | null {
  try {
    // Remove markdown code blocks if present
    let cleaned = response.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    return {
      vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
      invoiceNumber: typeof parsed.invoiceNumber === "string" ? parsed.invoiceNumber : null,
      invoiceDate: typeof parsed.invoiceDate === "string" ? parsed.invoiceDate : null,
      dueDate: typeof parsed.dueDate === "string" ? parsed.dueDate : null,
      customerPo: typeof parsed.customerPo === "string" ? parsed.customerPo : null,
      jobName: typeof parsed.jobName === "string" ? parsed.jobName : null,
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : null,
      tax: typeof parsed.tax === "number" ? parsed.tax : null,
      shipping: typeof parsed.shipping === "number" ? parsed.shipping : null,
      total: typeof parsed.total === "number" ? parsed.total : null,
      lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems.map((li: any) => ({
        productCode: typeof li.productCode === "string" ? li.productCode : null,
        description: typeof li.description === "string" ? li.description : "Unknown item",
        quantity: typeof li.quantity === "number" ? li.quantity : null,
        unit: typeof li.unit === "string" ? li.unit : null,
        unitPrice: typeof li.unitPrice === "number" ? li.unitPrice : null,
        lineAmount: typeof li.lineAmount === "number" ? li.lineAmount : null,
      })) : [],
    };
  } catch (e) {
    console.error("[LLM Fallback] Failed to parse response:", e);
    return null;
  }
}

/**
 * LLM extraction metrics for debugging and cost tracking
 */
export type LlmExtractionMetrics = {
  inputChars: number;
  inputCharsTruncated: boolean;
  maxTokens: number;
  provider: string;
  model: string;
};

/**
 * Extract invoice data using LLM as fallback
 * Throws LLMUnavailableError if API key is not set or invalid
 * Returns null if LLM returns invalid JSON
 *
 * @param ocrText - The OCR text to extract from
 * @param deterministicResult - Optional: if provided, uses PATCH mode
 * @param failureReasons - Optional: reasons why deterministic failed (for patch prompt)
 * @throws LLMUnavailableError if LLM is not configured
 */
export async function extractWithLLM(
  ocrText: string,
  deterministicResult?: ExtractedInvoice,
  failureReasons?: string[]
): Promise<{
  extraction: ExtractedInvoice;
  lineItems: LlmExtractionResult["lineItems"];
  patchMode: boolean;
  metrics: LlmExtractionMetrics;
} | null> {
  // Import from llmClient
  const { requireLlmClient, LLMUnavailableError: LlmError } = await import("./llmClient");

  // Get LLM client - throws if not configured
  const client = requireLlmClient();

  const patchMode = !!deterministicResult && !!failureReasons;

  console.log(`[LLM Fallback] Using ${patchMode ? "PATCH" : "FULL"} mode with ${client.provider}`);

  // Call LLM client
  const response = await client.extractInvoice({
    ocrText,
    mode: patchMode ? "patch" : "full",
    deterministicResult,
    failureReasons,
  });

  const metrics: LlmExtractionMetrics = {
    inputChars: response.metrics.inputChars,
    inputCharsTruncated: response.metrics.inputCharsTruncated,
    maxTokens: response.metrics.maxTokens,
    provider: response.metrics.provider,
    model: response.metrics.model,
  };

  if (!response.success || !response.data) {
    console.error(`[LLM Fallback] LLM failed: ${response.error}`);
    return null;
  }

  const llmResult = response.data;

  // Build ExtractedInvoice from LLM result
  const extraction: ExtractedInvoice = {
    vendor: typeof llmResult.vendor === "string" ? llmResult.vendor : null,
    vendorConfidence: llmResult.vendor ? 0.85 : 0,
    vendorReason: llmResult.vendor ? "LLM extraction" : "Not found by LLM",

    invoiceNumber: typeof llmResult.invoiceNumber === "string" ? llmResult.invoiceNumber : null,
    invoiceNumberConfidence: llmResult.invoiceNumber ? 0.85 : 0,
    invoiceDate: typeof llmResult.invoiceDate === "string" ? llmResult.invoiceDate : null,
    invoiceDateConfidence: llmResult.invoiceDate ? 0.85 : 0,
    dueDate: typeof llmResult.dueDate === "string" ? llmResult.dueDate : null,
    customerPo: typeof llmResult.customerPo === "string" ? llmResult.customerPo : null,
    jobName: typeof llmResult.jobName === "string" ? llmResult.jobName : null,

    subtotal: typeof llmResult.subtotal === "number" ? llmResult.subtotal : null,
    tax: typeof llmResult.tax === "number" ? llmResult.tax : null,
    shipping: typeof llmResult.shipping === "number" ? llmResult.shipping : null,
    fees: null,
    total: typeof llmResult.total === "number" ? llmResult.total : 0,
    totalConfidence: llmResult.total ? 0.85 : 0.3,
    totalReason: llmResult.total ? "LLM extraction" : "LLM could not determine total",

    totalsDebug: {
      candidates: [],
      selectedTotal: null,
      subtotalTaxValidation: llmResult.subtotal ? {
        subtotal: llmResult.subtotal,
        tax: llmResult.tax,
        shipping: llmResult.shipping,
        calculatedTotal: llmResult.subtotal + (llmResult.tax || 0) + (llmResult.shipping || 0),
        matchesSelected: Math.abs(
          (llmResult.total || 0) -
          (llmResult.subtotal + (llmResult.tax || 0) + (llmResult.shipping || 0))
        ) < 0.01,
        discrepancy: null,
      } : null,
      lineItemRegionPenalties: [],
      selectionReason: "LLM extraction",
    },
    extractionMethod: patchMode ? "llm_patch" : "llm_fallback",
  };

  // Parse line items if present
  const lineItems = Array.isArray(llmResult.lineItems) ? llmResult.lineItems.map((li: any) => ({
    productCode: typeof li.productCode === "string" ? li.productCode : null,
    description: typeof li.description === "string" ? li.description : "Unknown item",
    quantity: typeof li.quantity === "number" ? li.quantity : null,
    unit: typeof li.unit === "string" ? li.unit : null,
    unitPrice: typeof li.unitPrice === "number" ? li.unitPrice : null,
    lineAmount: typeof li.lineAmount === "number" ? li.lineAmount : null,
  })) : [];

  return {
    extraction,
    lineItems,
    patchMode,
    metrics,
  };
}

/**
 * Result type for extraction with fallback
 */
export type ExtractionWithFallbackResult = {
  extraction: ExtractedInvoice;
  llmLineItems?: LlmExtractionResult["lineItems"];
  usedLlm: boolean;
  fallbackReasons?: string[];
  /** True if LLM was needed but unavailable/failed - MUST NOT PERSIST */
  llmUnavailable?: boolean;
  /** True if extraction needs manual review (low confidence or LLM unavailable) */
  mustReview: boolean;
  /** Reason for mustReview if applicable */
  mustReviewReason?: string;
  /** LLM metrics for cost tracking */
  llmMetrics?: LlmExtractionMetrics;
};

/**
 * Combined extraction with automatic LLM fallback using PATCH mode
 * - Runs deterministic extraction first
 * - Calls needsLLMFallback() to check confidence gates
 * - If fallback needed, calls LLM in PATCH MODE (only fix failing fields)
 * - Applies selective merge logic based on confidence thresholds
 * - Returns mustReview=true if extraction is not safe to persist
 */
export async function extractInvoiceDataWithFallback(
  ocrText: string,
  existingLineItemCount: number = 0
): Promise<ExtractionWithFallbackResult> {
  // First try deterministic extraction
  const deterministicResult = extractInvoiceData(ocrText);

  // Check if we need LLM fallback using enhanced gate function
  const fallbackCheck = needsLLMFallback(deterministicResult, existingLineItemCount, ocrText);

  if (!fallbackCheck.fallback) {
    // All gates passed, return deterministic result
    // Final confidence check for mustReview
    const finalConf = deterministicResult.finalConfidence ?? Math.min(
      deterministicResult.vendorConfidence,
      deterministicResult.invoiceNumberConfidence || 0.5,
      deterministicResult.invoiceDateConfidence || 0.5,
      deterministicResult.totalConfidence
    );

    return {
      extraction: { ...deterministicResult, finalConfidence: finalConf },
      usedLlm: false,
      mustReview: finalConf < 0.75,
      mustReviewReason: finalConf < 0.75 ? `Low final confidence: ${finalConf.toFixed(2)}` : undefined,
    };
  }

  // Try LLM fallback in PATCH MODE
  console.log(`[extractInvoiceDataWithFallback] Attempting LLM PATCH mode: ${fallbackCheck.reasons.join(", ")}`);

  let llmResult: Awaited<ReturnType<typeof extractWithLLM>> = null;
  let llmUnavailable = false;
  let llmError: string | undefined;

  try {
    llmResult = await extractWithLLM(ocrText, deterministicResult, fallbackCheck.reasons);
  } catch (error: any) {
    if (error instanceof LLMUnavailableError) {
      llmUnavailable = true;
      llmError = error.message;
      console.warn(`[extractInvoiceDataWithFallback] LLM unavailable: ${error.message}`);
    } else {
      llmUnavailable = true;
      llmError = error?.message || "Unknown LLM error";
      console.error(`[extractInvoiceDataWithFallback] LLM error: ${llmError}`);
    }
  }

  // If LLM was needed but failed/unavailable -> MUST REVIEW, DO NOT PERSIST
  if (!llmResult) {
    const failureReason = llmUnavailable
      ? "LLM fallback failed or unavailable"
      : "LLM returned invalid response";

    return {
      extraction: {
        ...deterministicResult,
        fallbackReasons: [...fallbackCheck.reasons, failureReason],
      },
      usedLlm: false,
      llmUnavailable,
      fallbackReasons: [...fallbackCheck.reasons, failureReason],
      mustReview: true, // CRITICAL: Must not persist
      mustReviewReason: `Fallback needed but LLM ${llmUnavailable ? "unavailable" : "failed"}: ${fallbackCheck.reasons.join(", ")}`,
    };
  }

  // ========== SELECTIVE MERGE LOGIC ==========
  // Only replace fields that failed confidence gates

  const llm = llmResult.extraction;
  const det = deterministicResult;

  // --- VENDOR MERGE ---
  // Replace if: missing, confidence < 0.75, or looks like a label
  const shouldReplaceVendor = !det.vendor ||
    det.vendorConfidence < 0.75 ||
    isVendorLabelLike(det.vendor);

  const mergedVendor = shouldReplaceVendor && llm.vendor ? llm.vendor : det.vendor;
  const mergedVendorConfidence = shouldReplaceVendor && llm.vendor
    ? llm.vendorConfidence
    : det.vendorConfidence;
  const mergedVendorReason = shouldReplaceVendor && llm.vendor
    ? `LLM patch: ${llm.vendorReason}`
    : det.vendorReason;

  // --- INVOICE NUMBER MERGE ---
  // Replace if: missing or confidence < 0.7
  const shouldReplaceInvoiceNumber = !det.invoiceNumber ||
    (det.invoiceNumberConfidence || 0) < 0.7;

  const mergedInvoiceNumber = shouldReplaceInvoiceNumber && llm.invoiceNumber
    ? llm.invoiceNumber
    : det.invoiceNumber;
  const mergedInvoiceNumberConfidence = shouldReplaceInvoiceNumber && llm.invoiceNumber
    ? llm.invoiceNumberConfidence
    : det.invoiceNumberConfidence;

  // --- INVOICE DATE MERGE ---
  // Replace if: missing, invalid, or confidence < 0.5
  const shouldReplaceInvoiceDate = !det.invoiceDate ||
    !isValidDate(det.invoiceDate) ||
    (det.invoiceDateConfidence || 0) < 0.5;

  const mergedInvoiceDate = shouldReplaceInvoiceDate && llm.invoiceDate
    ? llm.invoiceDate
    : det.invoiceDate;
  const mergedInvoiceDateConfidence = shouldReplaceInvoiceDate && llm.invoiceDate
    ? llm.invoiceDateConfidence
    : det.invoiceDateConfidence;

  // --- TOTAL MERGE ---
  // Replace if: missing, < $10, confidence < 0.8, or reconciliation failed
  const detReconciliationFailed = det.subtotal !== null &&
    !checkReconciliation(det.subtotal, det.tax, det.shipping, det.fees, det.total);

  const shouldReplaceTotal = !det.total ||
    det.total < 10 ||
    det.totalConfidence < 0.8 ||
    detReconciliationFailed;

  const mergedTotal = shouldReplaceTotal && llm.total > 0 ? llm.total : det.total;
  const mergedTotalConfidence = shouldReplaceTotal && llm.total > 0
    ? llm.totalConfidence
    : det.totalConfidence;
  const mergedTotalReason = shouldReplaceTotal && llm.total > 0
    ? `LLM patch: ${llm.totalReason}`
    : det.totalReason;

  // --- SUBTOTAL/TAX/SHIPPING MERGE ---
  // Replace if: total was replaced OR these are missing
  const mergedSubtotal = shouldReplaceTotal && llm.subtotal !== null
    ? llm.subtotal
    : det.subtotal ?? llm.subtotal;
  const mergedTax = shouldReplaceTotal && llm.tax !== null
    ? llm.tax
    : det.tax ?? llm.tax;
  const mergedShipping = shouldReplaceTotal && llm.shipping !== null
    ? llm.shipping
    : det.shipping ?? llm.shipping;

  // --- LINE ITEMS ---
  // Only use LLM line items if deterministic had 0 and table headers exist
  const shouldUseLineItems = existingLineItemCount === 0 &&
    hasLineItemTableSignals(ocrText) &&
    llmResult.lineItems.length > 0;

  // Calculate final reconciliation validity
  const reconciliationValid = checkReconciliation(
    mergedSubtotal,
    mergedTax,
    mergedShipping,
    det.fees,
    mergedTotal
  );

  // Calculate final confidence as minimum of key field confidences
  const finalConfidence = Math.min(
    mergedVendorConfidence,
    mergedInvoiceNumberConfidence || 0.5,
    mergedInvoiceDateConfidence || 0.5,
    mergedTotalConfidence
  );

  const mergedExtraction: ExtractedInvoice = {
    vendor: mergedVendor,
    vendorConfidence: mergedVendorConfidence,
    vendorReason: mergedVendorReason,

    invoiceNumber: mergedInvoiceNumber,
    invoiceNumberConfidence: mergedInvoiceNumberConfidence,
    invoiceDate: mergedInvoiceDate,
    invoiceDateConfidence: mergedInvoiceDateConfidence,
    dueDate: det.dueDate || llm.dueDate,
    customerPo: det.customerPo || llm.customerPo,
    jobName: det.jobName || llm.jobName,

    subtotal: mergedSubtotal,
    tax: mergedTax,
    shipping: mergedShipping,
    fees: det.fees,
    total: mergedTotal,
    totalConfidence: mergedTotalConfidence,
    totalReason: mergedTotalReason,

    totalsDebug: det.totalsDebug,
    extractionMethod: llmResult.patchMode ? "llm_patch" : "llm_fallback",
    fallbackReasons: fallbackCheck.reasons,
    finalConfidence,
    reconciliationValid,
  };

  // ========== DETERMINE IF MUST REVIEW ==========
  // Thresholds: finalConfidence >= 0.75 AND vendorConfidence >= 0.75 AND totalConfidence >= 0.8
  const vendorStillBad = !mergedVendor || mergedVendorConfidence < 0.75 || isVendorLabelLike(mergedVendor);
  const totalStillBad = mergedTotal <= 0 || mergedTotalConfidence < 0.8;
  const confidenceTooLow = finalConfidence < 0.75;

  const mustReview = vendorStillBad || totalStillBad || confidenceTooLow;
  let mustReviewReason: string | undefined;

  if (mustReview) {
    const reasons: string[] = [];
    if (vendorStillBad) reasons.push(`vendor issue (${mergedVendor ? `conf=${mergedVendorConfidence.toFixed(2)}` : "missing"})`);
    if (totalStillBad) reasons.push(`total issue ($${mergedTotal}, conf=${mergedTotalConfidence.toFixed(2)})`);
    if (confidenceTooLow) reasons.push(`low final confidence (${finalConfidence.toFixed(2)})`);
    mustReviewReason = `Post-LLM quality check failed: ${reasons.join(", ")}`;
  }

  return {
    extraction: mergedExtraction,
    llmLineItems: shouldUseLineItems ? llmResult.lineItems : undefined,
    usedLlm: true,
    fallbackReasons: fallbackCheck.reasons,
    mustReview,
    mustReviewReason,
    llmMetrics: llmResult.metrics,
  };
}
