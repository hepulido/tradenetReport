#!/usr/bin/env npx tsx
/**
 * Test script to verify pdf-parse library works correctly
 * Run: npx tsx scripts/test-pdf-parse.ts
 */

import { testPdfParse, extractPdfText } from "../server/pdfExtract";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=== PDF-Parse Library Test ===\n");

  // Test 1: Basic library test
  console.log("1. Testing pdf-parse library import...");
  const basicTest = await testPdfParse();
  console.log("   Result:", basicTest);

  if (!basicTest.success) {
    console.error("\n❌ pdf-parse library test FAILED");
    console.error("   Error:", basicTest.error);
    process.exit(1);
  }

  console.log("\n✅ pdf-parse library loaded successfully\n");

  // Test 2: If a test PDF path is provided, test actual extraction
  const testPdfPath = process.argv[2];
  if (testPdfPath) {
    console.log(`2. Testing extraction on: ${testPdfPath}`);

    if (!fs.existsSync(testPdfPath)) {
      console.error(`   ❌ File not found: ${testPdfPath}`);
      process.exit(1);
    }

    const buffer = fs.readFileSync(testPdfPath);
    console.log(`   File size: ${buffer.length} bytes`);

    const result = await extractPdfText(buffer, true);

    console.log("\n   Extraction Result:");
    console.log(`   - pageCount: ${result.pageCount}`);
    console.log(`   - textLength: ${result.textLength}`);
    console.log(`   - hasUsableText: ${result.hasUsableText}`);
    console.log(`   - method: ${result.method}`);

    if (result.debug) {
      console.log("\n   Debug Info:");
      console.log(`   - bufferLength: ${result.debug.bufferLength}`);
      console.log(`   - isPdfMagic: ${result.debug.isPdfMagic}`);
      console.log(`   - magicBytes: ${result.debug.magicBytes}`);
      console.log(`   - possibleImageOnlyPdf: ${result.debug.possibleImageOnlyPdf}`);
      if (result.debug.parseError) {
        console.log(`   - parseError: ${result.debug.parseError}`);
      }
      if (result.debug.info) {
        console.log(`   - info:`, result.debug.info);
      }
    }

    if (result.text) {
      console.log(`\n   Text Preview (first 500 chars):`);
      console.log(`   ${result.text.slice(0, 500).replace(/\n/g, "\n   ")}`);
    }

    if (result.hasUsableText) {
      console.log("\n✅ PDF extraction successful");
    } else {
      console.log("\n⚠️  PDF has no usable text (may be scanned/image-only)");
    }
  } else {
    console.log("2. To test a specific PDF file:");
    console.log("   npx tsx scripts/test-pdf-parse.ts /path/to/file.pdf");
  }

  console.log("\n=== Test Complete ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
