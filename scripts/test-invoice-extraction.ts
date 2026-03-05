/**
 * Invoice Extraction Regression Test Suite
 *
 * Tests the invoice extraction logic with fixture-based OCR samples:
 * - Deterministic extraction quality
 * - Confidence gates
 * - LLM fallback/patch mode
 *
 * Run: npx tsx scripts/test-invoice-extraction.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  extractInvoiceData,
  needsLLMFallback,
  extractInvoiceDataWithFallback,
  ExtractedInvoice,
} from "../server/invoiceExtract";
import { categorizeLineItems } from "../server/categorize";

// ========== FIXTURE LOADING ==========

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");

function loadFixture(filename: string): string {
  const filepath = path.join(FIXTURES_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Fixture not found: ${filepath}`);
  }
  return fs.readFileSync(filepath, "utf-8");
}

function listFixtures(): string[] {
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.warn(`Fixtures directory not found: ${FIXTURES_DIR}`);
    return [];
  }
  return fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".txt"));
}

// ========== TEST UTILITIES ==========

function printDivider(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70) + "\n");
}

function printSubsection(title: string) {
  console.log(`\n--- ${title} ---`);
}

type Assertion = {
  name: string;
  expected: string | number | boolean;
  actual: string | number | boolean | null | undefined;
  passed: boolean;
};

// ========== FIXTURE-BASED TESTS ==========

type FixtureExpectation = {
  fixture: string;
  expectations: {
    vendor?: string;
    vendorContains?: string;
    vendorNotContains?: string; // Vendor should NOT contain this
    vendorConfidenceMin?: number;
    invoiceNumber?: string;
    invoiceNumberContains?: string;
    invoiceDateContains?: string;
    total?: number;
    totalMin?: number;
    totalMax?: number;
    totalConfidenceMin?: number;
    shouldTriggerFallback?: boolean;
    extractionMethod?: "deterministic" | "llm_patch" | "llm_fallback";
    mustRejectVendor?: boolean; // Vendor should be null/rejected
  };
};

const FIXTURE_EXPECTATIONS: FixtureExpectation[] = [
  {
    fixture: "fbm-invoice.txt",
    expectations: {
      vendor: "Foundation Building Materials",
      invoiceNumber: "120040985-00",
      invoiceDateContains: "2024-01-15",
      total: 5153.49,
      totalConfidenceMin: 0.8,
      vendorConfidenceMin: 0.8,
      shouldTriggerFallback: false,
    },
  },
  {
    fixture: "acme-supply.txt",
    expectations: {
      vendorContains: "ACME",
      invoiceNumber: "INV-88321",
      total: 3428.82,
      totalConfidenceMin: 0.7,
      shouldTriggerFallback: false,
    },
  },
  {
    fixture: "hvac-supplier.txt",
    expectations: {
      vendorContains: "CLIMATE CONTROL",
      invoiceNumberContains: "CCD",
      total: 13768.63,
      vendorConfidenceMin: 0.7,
    },
  },
  {
    fixture: "concrete-supplier.txt",
    expectations: {
      vendorContains: "CONCRETE",
      invoiceNumberContains: "456789",
      total: 4330.0,
    },
  },
  {
    fixture: "simple-invoice.txt",
    expectations: {
      vendorContains: "HomeDepot",
      invoiceNumberContains: "HD-99887766",
      total: 2456.78,
    },
  },
  {
    fixture: "poor-ocr-vendor.txt",
    expectations: {
      // Vendor is garbled - should trigger fallback
      shouldTriggerFallback: true,
      totalMin: 1300,
      totalMax: 1400,
    },
  },
  {
    fixture: "reconciliation-fail.txt",
    expectations: {
      vendorContains: "Metro Electrical",
      total: 12500.0,
      // Reconciliation fails - may trigger fallback
      shouldTriggerFallback: true,
    },
  },
  {
    fixture: "missing-date.txt",
    expectations: {
      vendorContains: "PACIFIC PLUMBING",
      invoiceNumberContains: "PP-2024-1234",
      total: 1768.53,
      // Missing date - should trigger fallback
      shouldTriggerFallback: true,
    },
  },
  {
    fixture: "low-confidence-number.txt",
    expectations: {
      vendorContains: "ROOFING",
      total: 3429.0,
      // Invoice number "abc" is low confidence
      shouldTriggerFallback: true,
    },
  },
  {
    fixture: "garbled-ocr.txt",
    expectations: {
      // Very garbled OCR - vendor is nearly unreadable
      shouldTriggerFallback: true,
      totalMin: 1500,
      totalMax: 1700,
    },
  },
  // ========== NEW CRITICAL TESTS ==========
  {
    fixture: "junk-vendor-test.txt",
    expectations: {
      // "Return Service Requested" should be REJECTED as vendor
      mustRejectVendor: true,
      vendorNotContains: "Return Service Requested",
      shouldTriggerFallback: true,
    },
  },
  {
    fixture: "fbm-real-invoice.txt",
    expectations: {
      vendor: "Foundation Building Materials",
      invoiceNumber: "120040985-00",
      total: 5153.49,
      vendorConfidenceMin: 0.8,
      totalConfidenceMin: 0.8,
      shouldTriggerFallback: false,
    },
  },
];

function runFixtureTest(
  fixtureName: string,
  expectations: FixtureExpectation["expectations"]
): { extraction: ExtractedInvoice; assertions: Assertion[]; fallbackCheck: ReturnType<typeof needsLLMFallback> } {
  const ocrText = loadFixture(fixtureName);
  const extraction = extractInvoiceData(ocrText);

  // Get line items for fallback check
  const lines = ocrText.split("\n").filter((l) => l.trim());
  const lineItems = lines
    .filter((l) => /\$?\d+\.\d{2}/.test(l) && l.length > 20)
    .slice(0, 10)
    .map((l) => ({ description: l, productCode: null }));

  const fallbackCheck = needsLLMFallback(extraction, lineItems.length, ocrText);
  const assertions: Assertion[] = [];

  // Check vendor expectations
  if (expectations.vendor) {
    assertions.push({
      name: `${fixtureName}: vendor exact match`,
      expected: expectations.vendor,
      actual: extraction.vendor,
      passed: extraction.vendor === expectations.vendor,
    });
  }
  if (expectations.vendorContains) {
    assertions.push({
      name: `${fixtureName}: vendor contains "${expectations.vendorContains}"`,
      expected: expectations.vendorContains,
      actual: extraction.vendor,
      passed: extraction.vendor?.toUpperCase().includes(expectations.vendorContains.toUpperCase()) ?? false,
    });
  }
  if (expectations.vendorConfidenceMin !== undefined) {
    assertions.push({
      name: `${fixtureName}: vendor confidence >= ${expectations.vendorConfidenceMin}`,
      expected: expectations.vendorConfidenceMin,
      actual: extraction.vendorConfidence,
      passed: extraction.vendorConfidence >= expectations.vendorConfidenceMin,
    });
  }
  // NEW: Check vendor NOT contains (for junk rejection)
  if (expectations.vendorNotContains) {
    assertions.push({
      name: `${fixtureName}: vendor does NOT contain "${expectations.vendorNotContains}"`,
      expected: `NOT "${expectations.vendorNotContains}"`,
      actual: extraction.vendor,
      passed: !(extraction.vendor?.toLowerCase().includes(expectations.vendorNotContains.toLowerCase()) ?? false),
    });
  }
  // NEW: Check vendor is rejected (null or low confidence)
  if (expectations.mustRejectVendor) {
    assertions.push({
      name: `${fixtureName}: vendor must be rejected (null or label-like)`,
      expected: "null or low confidence",
      actual: extraction.vendor,
      passed: !extraction.vendor || extraction.vendorConfidence < 0.5,
    });
  }

  // Check invoice number expectations
  if (expectations.invoiceNumber) {
    assertions.push({
      name: `${fixtureName}: invoice number exact match`,
      expected: expectations.invoiceNumber,
      actual: extraction.invoiceNumber,
      passed: extraction.invoiceNumber === expectations.invoiceNumber,
    });
  }
  if (expectations.invoiceNumberContains) {
    assertions.push({
      name: `${fixtureName}: invoice number contains "${expectations.invoiceNumberContains}"`,
      expected: expectations.invoiceNumberContains,
      actual: extraction.invoiceNumber,
      passed: extraction.invoiceNumber?.includes(expectations.invoiceNumberContains) ?? false,
    });
  }

  // Check date expectations
  if (expectations.invoiceDateContains) {
    assertions.push({
      name: `${fixtureName}: invoice date contains "${expectations.invoiceDateContains}"`,
      expected: expectations.invoiceDateContains,
      actual: extraction.invoiceDate,
      passed: extraction.invoiceDate?.includes(expectations.invoiceDateContains) ?? false,
    });
  }

  // Check total expectations
  if (expectations.total !== undefined) {
    assertions.push({
      name: `${fixtureName}: total exact match`,
      expected: expectations.total,
      actual: extraction.total,
      passed: Math.abs(extraction.total - expectations.total) < 0.01,
    });
  }
  if (expectations.totalMin !== undefined) {
    assertions.push({
      name: `${fixtureName}: total >= ${expectations.totalMin}`,
      expected: expectations.totalMin,
      actual: extraction.total,
      passed: extraction.total >= expectations.totalMin,
    });
  }
  if (expectations.totalMax !== undefined) {
    assertions.push({
      name: `${fixtureName}: total <= ${expectations.totalMax}`,
      expected: expectations.totalMax,
      actual: extraction.total,
      passed: extraction.total <= expectations.totalMax,
    });
  }
  if (expectations.totalConfidenceMin !== undefined) {
    assertions.push({
      name: `${fixtureName}: total confidence >= ${expectations.totalConfidenceMin}`,
      expected: expectations.totalConfidenceMin,
      actual: extraction.totalConfidence,
      passed: extraction.totalConfidence >= expectations.totalConfidenceMin,
    });
  }

  // Check fallback trigger expectations
  if (expectations.shouldTriggerFallback !== undefined) {
    assertions.push({
      name: `${fixtureName}: shouldTriggerFallback = ${expectations.shouldTriggerFallback}`,
      expected: expectations.shouldTriggerFallback,
      actual: fallbackCheck.fallback,
      passed: fallbackCheck.fallback === expectations.shouldTriggerFallback,
    });
  }

  return { extraction, assertions, fallbackCheck };
}

// ========== DETAILED TEST OUTPUT ==========

function printExtractionDetails(name: string, extraction: ExtractedInvoice) {
  console.log(`\n   === ${name} ===`);
  console.log(`   Vendor: ${extraction.vendor || "NOT FOUND"} (confidence: ${extraction.vendorConfidence.toFixed(2)})`);
  console.log(`   Invoice #: ${extraction.invoiceNumber || "NOT FOUND"} (confidence: ${(extraction.invoiceNumberConfidence || 0).toFixed(2)})`);
  console.log(`   Date: ${extraction.invoiceDate || "NOT FOUND"} (confidence: ${(extraction.invoiceDateConfidence || 0).toFixed(2)})`);
  console.log(`   Total: $${extraction.total.toFixed(2)} (confidence: ${extraction.totalConfidence.toFixed(2)})`);
  console.log(`   Method: ${extraction.extractionMethod}`);

  if (extraction.subtotal) {
    console.log(`   Subtotal: $${extraction.subtotal.toFixed(2)} | Tax: $${extraction.tax?.toFixed(2) || "0"} | Shipping: $${extraction.shipping?.toFixed(2) || "0"}`);
    console.log(`   Reconciliation Valid: ${extraction.reconciliationValid ? "YES" : "NO"}`);
  }

  if (extraction.finalConfidence !== undefined) {
    console.log(`   Final Confidence: ${extraction.finalConfidence.toFixed(2)}`);
  }
}

// ========== MUST REVIEW TEST (runs without API key) ==========

async function testMustReviewWhenLlmUnavailable() {
  printDivider("MUST REVIEW TEST (LLM unavailable scenario)");

  const assertions: Assertion[] = [];

  // Test that when fallback is needed but LLM unavailable, mustReview=true
  // This test uses poor-ocr-vendor which needs fallback
  console.log("   Testing poor-ocr-vendor.txt (fallback needed, LLM may be unavailable)...\n");

  const ocrText = loadFixture("poor-ocr-vendor.txt");
  const result = await extractInvoiceDataWithFallback(ocrText, 0);

  console.log(`   mustReview: ${result.mustReview}`);
  console.log(`   mustReviewReason: ${result.mustReviewReason || "N/A"}`);
  console.log(`   llmUnavailable: ${result.llmUnavailable || false}`);
  console.log(`   usedLlm: ${result.usedLlm}`);

  // If LLM was NOT available, mustReview MUST be true
  if (!process.env.ANTHROPIC_API_KEY || result.llmUnavailable) {
    assertions.push({
      name: "LLM unavailable: mustReview is true",
      expected: true,
      actual: result.mustReview,
      passed: result.mustReview === true,
    });

    assertions.push({
      name: "LLM unavailable: fallbackReasons mentions unavailable",
      expected: "contains 'unavailable'",
      actual: result.fallbackReasons?.join(", ") || "",
      passed: (result.fallbackReasons || []).some(r => r.toLowerCase().includes("unavailable") || r.toLowerCase().includes("failed")),
    });

    console.log("\n   (This test validates that extraction requiring LLM fallback");
    console.log("    correctly sets mustReview=true when LLM is not available)");
  } else {
    console.log("\n   (LLM was available - mustReview depends on post-LLM quality)");
    assertions.push({
      name: "LLM available: result has mustReview field",
      expected: "defined",
      actual: result.mustReview !== undefined ? "defined" : "undefined",
      passed: result.mustReview !== undefined,
    });
  }

  // Print results
  let passed = 0;
  let failed = 0;
  for (const a of assertions) {
    const status = a.passed ? "PASS" : "FAIL";
    console.log(`\n   ${status}: ${a.name}`);
    if (!a.passed) {
      console.log(`          Expected: ${a.expected}`);
      console.log(`          Actual:   ${a.actual}`);
      failed++;
    } else {
      passed++;
    }
  }

  return { passed, failed, skipped: false };
}

// ========== LLM FALLBACK TEST ==========

async function testLlmPatchMode() {
  printDivider("LLM PATCH MODE TEST");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("   ANTHROPIC_API_KEY not set - skipping LLM patch mode test");
    console.log("   Set the key to test: export ANTHROPIC_API_KEY=sk-ant-...\n");
    return { passed: 0, failed: 0, skipped: true };
  }

  const assertions: Assertion[] = [];

  // Test with poor-ocr-vendor fixture (triggers LLM patch for vendor)
  try {
    console.log("   Testing poor-ocr-vendor.txt with LLM fallback...\n");
    const ocrText = loadFixture("poor-ocr-vendor.txt");

    const result = await extractInvoiceDataWithFallback(ocrText, 0);

    console.log(`   Used LLM: ${result.usedLlm ? "YES" : "NO"}`);
    console.log(`   Extraction Method: ${result.extraction.extractionMethod}`);
    if (result.fallbackReasons && result.fallbackReasons.length > 0) {
      console.log(`   Fallback Reasons:`);
      for (const reason of result.fallbackReasons) {
        console.log(`     - ${reason}`);
      }
    }

    printExtractionDetails("Result", result.extraction);

    // If LLM was used, check that it patched the vendor
    if (result.usedLlm) {
      assertions.push({
        name: "LLM patch: extraction method is llm_patch",
        expected: "llm_patch",
        actual: result.extraction.extractionMethod,
        passed: result.extraction.extractionMethod === "llm_patch",
      });

      // LLM should have found the vendor (Blue Ridge Builders Supply)
      assertions.push({
        name: "LLM patch: vendor was extracted",
        expected: true,
        actual: !!result.extraction.vendor,
        passed: !!result.extraction.vendor && result.extraction.vendor.length > 5,
      });
    }
  } catch (error: any) {
    console.log(`   LLM patch test error: ${error?.message || error}`);
    assertions.push({
      name: "LLM patch: no error",
      expected: "no error",
      actual: error?.message || "unknown error",
      passed: false,
    });
  }

  // Test with garbled-ocr fixture
  try {
    console.log("\n   Testing garbled-ocr.txt with LLM fallback...\n");
    const ocrText = loadFixture("garbled-ocr.txt");

    const result = await extractInvoiceDataWithFallback(ocrText, 0);

    console.log(`   Used LLM: ${result.usedLlm ? "YES" : "NO"}`);
    console.log(`   Extraction Method: ${result.extraction.extractionMethod}`);

    printExtractionDetails("Result", result.extraction);

    if (result.usedLlm) {
      assertions.push({
        name: "LLM garbled: total is reasonable",
        expected: "~1620",
        actual: result.extraction.total,
        passed: result.extraction.total >= 1500 && result.extraction.total <= 1700,
      });
    }
  } catch (error: any) {
    console.log(`   LLM garbled test error: ${error?.message || error}`);
  }

  // Print LLM test results
  let passed = 0;
  let failed = 0;
  for (const a of assertions) {
    const status = a.passed ? "PASS" : "FAIL";
    console.log(`\n   ${status}: ${a.name}`);
    if (!a.passed) {
      console.log(`          Expected: ${a.expected}`);
      console.log(`          Actual:   ${a.actual}`);
      failed++;
    } else {
      passed++;
    }
  }

  return { passed, failed, skipped: false };
}

// ========== MAIN ==========

async function main() {
  console.log("\n" + "█".repeat(70));
  console.log("  INVOICE EXTRACTION REGRESSION TEST SUITE");
  console.log("█".repeat(70));

  // List available fixtures
  printDivider("AVAILABLE FIXTURES");
  const fixtures = listFixtures();
  for (const f of fixtures) {
    console.log(`   - ${f}`);
  }

  // Run deterministic tests for all fixtures with expectations
  printDivider("DETERMINISTIC EXTRACTION TESTS");

  const allAssertions: Assertion[] = [];
  const testResults: { fixture: string; extraction: ExtractedInvoice; fallbackCheck: ReturnType<typeof needsLLMFallback> }[] = [];

  for (const test of FIXTURE_EXPECTATIONS) {
    if (!fixtures.includes(test.fixture)) {
      console.log(`   ⚠️  Fixture not found: ${test.fixture} - skipping`);
      continue;
    }

    printSubsection(test.fixture);

    try {
      const { extraction, assertions, fallbackCheck } = runFixtureTest(test.fixture, test.expectations);
      testResults.push({ fixture: test.fixture, extraction, fallbackCheck });
      allAssertions.push(...assertions);

      // Print summary for this fixture
      console.log(`   Vendor: ${extraction.vendor || "NOT FOUND"} (conf: ${extraction.vendorConfidence.toFixed(2)})`);
      console.log(`   Invoice #: ${extraction.invoiceNumber || "NOT FOUND"}`);
      console.log(`   Total: $${extraction.total.toFixed(2)} (conf: ${extraction.totalConfidence.toFixed(2)})`);
      console.log(`   Needs LLM Fallback: ${fallbackCheck.fallback ? "YES" : "NO"}`);
      if (fallbackCheck.fallback && fallbackCheck.reasons.length > 0) {
        console.log(`   Fallback Reasons: ${fallbackCheck.reasons.slice(0, 2).join(", ")}${fallbackCheck.reasons.length > 2 ? "..." : ""}`);
      }

      // Print assertion results for this fixture
      const fixtureAssertions = assertions;
      const passedCount = fixtureAssertions.filter((a) => a.passed).length;
      const failedCount = fixtureAssertions.filter((a) => !a.passed).length;
      console.log(`   Assertions: ${passedCount} passed, ${failedCount} failed`);

      if (failedCount > 0) {
        for (const a of fixtureAssertions.filter((a) => !a.passed)) {
          console.log(`     FAIL: ${a.name}`);
          console.log(`           Expected: ${a.expected}`);
          console.log(`           Actual:   ${a.actual}`);
        }
      }
    } catch (error: any) {
      console.log(`   ERROR: ${error?.message || error}`);
      allAssertions.push({
        name: `${test.fixture}: no error loading`,
        expected: "no error",
        actual: error?.message || "unknown",
        passed: false,
      });
    }
  }

  // Run mustReview test (works without API key)
  const mustReviewResults = await testMustReviewWhenLlmUnavailable();

  // Run LLM patch mode test (requires API key)
  const llmResults = await testLlmPatchMode();

  // Print final summary
  printDivider("FINAL SUMMARY");

  // Summary table
  console.log("   Fixture Results:");
  for (const result of testResults) {
    const fallbackStatus = result.fallbackCheck.fallback ? "NEEDS_LLM" : "OK";
    console.log(
      `   ${result.fixture.padEnd(25)} | $${result.extraction.total.toFixed(2).padStart(10)} | ${fallbackStatus.padEnd(10)} | vendor: ${(result.extraction.vendor || "?").slice(0, 20)}`
    );
  }

  // Assertion summary
  printSubsection("Assertion Results");
  const totalPassed = allAssertions.filter((a) => a.passed).length;
  const totalFailed = allAssertions.filter((a) => !a.passed).length;

  console.log(`   Deterministic: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(`   Must Review:   ${mustReviewResults.passed} passed, ${mustReviewResults.failed} failed`);
  if (!llmResults.skipped) {
    console.log(`   LLM Patch:     ${llmResults.passed} passed, ${llmResults.failed} failed`);
  } else {
    console.log(`   LLM Patch:     SKIPPED (no API key)`);
  }

  // List failures
  const failures = allAssertions.filter((a) => !a.passed);
  if (failures.length > 0) {
    printSubsection("Failed Assertions");
    for (const f of failures) {
      console.log(`   FAIL: ${f.name}`);
      console.log(`         Expected: ${f.expected}`);
      console.log(`         Actual:   ${f.actual}`);
    }
  }

  // Final status
  const overallFailed = totalFailed + llmResults.failed + mustReviewResults.failed;
  if (overallFailed > 0) {
    console.log(`\n   ⚠️  ${overallFailed} assertion(s) failed!\n`);
    process.exit(1);
  } else {
    console.log(`\n   ✓ All assertions passed!\n`);
  }
}

main().catch(console.error);
