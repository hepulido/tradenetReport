#!/usr/bin/env npx tsx
/**
 * Test script to verify OCR line-item fallback parser
 * Run: npx tsx scripts/test-ocr-parser.ts
 */

import { parseOcrToStructured, parseOcrTableLineItems } from "../server/ocrParse";

// Sample OCR text (from the user's example)
const sampleOcrText = `
INVOICE
Invoice #: INV-2024-001
Date: 01/15/2024

Sold To:
ABC Construction Company
123 Main Street

Qty Ordered Shipped Unit Price Amount
5.00 CGAHD8906F08G ARM DRYWALL 12' MAIN 8" OC FACETED (12/CTN) 1,044.00
16.00 CGAXL8945P ARM DRYWALL I.D. 4' CR TEE (36/CTN) UNPAINTED 2,276.35
17.00 CGAFZRC2AG ARM RADIUS CLIP (50/CTN) 1,496.00

Subtotal 4,816.35
Taxes 337.14
Total 5,153.49

Thank you for your business!
`;

async function main() {
  console.log("=== OCR Line-Item Fallback Parser Test ===\n");

  // Test the full parser
  console.log("1. Testing parseOcrToStructured() with sample invoice...\n");

  const result = parseOcrToStructured(sampleOcrText);

  console.log("Document Type:", result.docType);
  console.log("Vendor:", result.vendorOrClient);
  console.log("Totals:", result.totals);
  console.log("Warnings:", result.warnings);
  console.log("");

  console.log("Line Items Debug:");
  console.log(JSON.stringify(result.lineItemsDebug, null, 2));
  console.log("");

  console.log(`Line Items (${result.lineItems.length}):`);
  for (const item of result.lineItems) {
    console.log("  -", {
      description: item.description?.slice(0, 50),
      quantity: item.quantity,
      productCode: item.productCode,
      lineAmount: item.lineAmount,
    });
  }

  console.log("\n2. Testing parseOcrTableLineItems() directly...\n");

  const lines = sampleOcrText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const tableResult = parseOcrTableLineItems(lines);

  console.log("Debug:", JSON.stringify(tableResult.debug, null, 2));
  console.log("");

  console.log(`Extracted Items (${tableResult.items.length}):`);
  for (const item of tableResult.items) {
    console.log({
      quantity: item.quantity,
      productCode: item.productCode,
      description: item.description,
      lineAmount: item.lineAmount,
      rawLine: item.rawLine.slice(0, 80),
    });
  }

  console.log("\n=== Test Complete ===");

  // Summary
  console.log("\n=== Summary ===");
  console.log(`✅ Line items extracted: ${result.lineItems.length}`);
  console.log(`✅ Totals detected: ${result.totals?.possibleTotals?.join(", ") || "none"}`);
  console.log(`✅ Document type: ${result.docType}`);

  if (result.lineItems.length > 0 && !result.warnings.some(w => w.includes("No line items"))) {
    console.log(`✅ "No line items" warning suppressed`);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
