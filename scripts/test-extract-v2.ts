#!/usr/bin/env npx tsx
/**
 * Test the V2 extraction with multi-invoice support
 * Run: npx tsx scripts/test-extract-v2.ts
 */

import "dotenv/config";
import * as fs from "fs";
import { extractAllInvoices } from "../server/invoiceExtractV2";

// You can test with OCR text directly
const TEST_OCR_TEXT = `
Banner Supply Co.
7195 NW 30th Street
Miami, FL 33122
Phone: (305)-593-2946

INVOICE
MIA0000538377-001

Invoice Date: 12/23/25
Account: 301027 0084
Branch: MIAMI
Phone: (305)-497-3697

Bill To: TREBOL CONTRACTORS CORP
20441 NE 30 AVE
SUITE 116
AVENTURA, FL 33180

Ship To: ARIA RESERVE
700 NE 24 STREET
UNIT PHM04
MIAMI, FL 33137

PO:
Order Date: 12/23/25
Ship Date: 12/23/25
Sales Agents: CHEARN
Order Type: CPU
Ship Via: CUSTOMER P/U
Job:

QTY ORDERED | QTY SHIPPED | UOM | ITEM/DESCRIPTION | CONVERTED QTY | PRICE/UOM | AMOUNT
10 | 10 | PC | VCB125A VINYL 1 1/4" X 1 1/4" DRYWALL ARCH CORNE 50 PCS/BOX | .1000/MLF | 221.43/MLF | 22.14

Subtotal: 22.14
6.0% STATE SALES TAX: 1.33
1.0% COUNTY SALES TAX: 0.22
Delivery: 12.00
Balance: $35.69

---

Banner Supply Co.
7195 NW 30th Street
Miami, FL 33122
Phone: (305)-593-2946

INVOICE
MIA0000538146-001

Invoice Date: 12/22/25
Account: 301027 0089
Branch: MIAMI

Bill To: TREBOL CONTRACTORS CORP
20441 NE 30 AVE
SUITE 116
AVENTURA, FL 33180

Ship To: COACH
525 SW 145TH TERRACE
SPACE 7145
GC: AXXYS CONSTRUCTION GROUP
PEMBROKE PINES, FL 33027

PO: ELIO
Order Date: 12/22/25
Ship Date: 12/22/25
Sales Agents: CHEARN

QTY ORDERED | QTY SHIPPED | UOM | ITEM/DESCRIPTION | PRICE/UOM | AMOUNT
3 | 3 | PC | S3A20 3" X 3" ANGLE 20 GA 10' | 1,130.00/MLF | 33.90
6 | 6 | PC | S112A20 1 1/2" X 1 1/2" ANGLE 20 GA 10' | 745.00/MLF | 44.70
30 | 30 | PC | S358S20 3-5/8" X 12' STUD 20 GA | 550.00/MLF | 198.00
4 | 4 | PC | SHHC20 7/8" X 10' HI HAT CHANNEL 20 GA | 710.00/MLF | 28.40
5 | 5 | PC | S358STS16 3 5/8" SLIP TRACK SLOTTED 16 GA 10FT | 1,055.00/MLF | 52.75
5 | 5 | PC | S358T16 3 5/8" TRACK 16 GA 10' | 800.00/MLF | 40.00

Subtotal: 397.75
6.0% STATE SALES TAX: 23.87
1.0% COUNTY SALES TAX: 3.98
Delivery: 12.00
Balance: $437.60
`;

async function main() {
  console.log("\n🔄 Testing V2 Extraction (Multi-Invoice Support)\n");
  console.log("=".repeat(60));

  const result = await extractAllInvoices(TEST_OCR_TEXT);

  if (!result.success) {
    console.error("❌ Extraction failed:", result.error);
    return;
  }

  console.log(`\n✅ Extracted ${result.invoices.length} invoices\n`);

  for (const inv of result.invoices) {
    console.log("=".repeat(60));
    console.log(`📄 INVOICE: ${inv.invoiceNumber}`);
    console.log("=".repeat(60));
    console.log(`Vendor:     ${inv.vendor}`);
    console.log(`Date:       ${inv.invoiceDate}`);
    console.log(`Due:        ${inv.dueDate || "N/A"}`);
    console.log(`Job/Ship To: ${inv.jobName || "N/A"}`);
    console.log(`PO:         ${inv.customerPo || "N/A"}`);
    console.log(`Subtotal:   $${inv.subtotal.toFixed(2)}`);
    console.log(`Tax:        $${inv.tax.toFixed(2)}`);
    console.log(`Total:      $${inv.total.toFixed(2)}`);

    console.log(`\n📦 LINE ITEMS (${inv.lineItems.length}):`);
    console.log("-".repeat(60));

    for (const li of inv.lineItems) {
      const cat = li.category.padEnd(16);
      const conf = (li.categoryConfidence * 100).toFixed(0) + "%";
      const qty = li.quantity?.toString().padStart(4) || "   -";
      const amt = li.lineAmount ? `$${li.lineAmount.toFixed(2)}`.padStart(10) : "         -";
      console.log(`  ${cat} ${conf.padStart(4)} x${qty} ${amt}  ${li.description.slice(0, 35)}`);
    }

    // Summary by category
    console.log(`\n📊 BY CATEGORY:`);
    const byCategory: Record<string, number> = {};
    for (const li of inv.lineItems) {
      byCategory[li.category] = (byCategory[li.category] || 0) + (li.lineAmount || 0);
    }
    for (const [cat, total] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(18)} $${total.toFixed(2)}`);
    }
    console.log("");
  }

  console.log("=".repeat(60));
  console.log("✅ V2 Extraction Test Complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
