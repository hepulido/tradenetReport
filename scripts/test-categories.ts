#!/usr/bin/env npx tsx
/**
 * Test categorization with real invoice items from Trebol Contractors
 */

import { categorizeLineItem } from "../server/categorize";

const testItems = [
  // Banner Supply invoices
  "VCB125A VINYL 1 1/4\" X 1 1/4\" DRYWALL ARCH CORNE",
  "S3A20 3\" X 3\" ANGLE 20 GA 10'",
  "S112A20 1 1/2\" X 1 1/2\" ANGLE 20 GA 10'",
  "S358S20 3-5/8\"X12' STUD 20 GA 3 5/8\" WIDE",
  "SHHC20 7/8\"X10' HI HAT CHANNEL 20 GA 7/8\" WIDE",
  "S358STS16 3 5/8\" SLIP TRACK SLOTTED 16 GA 10FT",
  "S358T16 3 5/8\" TRACK 16 GA 10'",

  // Home Depot receipt
  "DYNAFLEX ULTRA BLACK 10.1OZ",
  "RAMSET 1\" PIN W/WASHER 100PK",
  "GORILLA BLACK DUCT TAPE 30YD",
  "STNDRD PLEATED PAPER FLTR FOR RIDGID",

  // FBM invoice
  "CGAHD8906F08G ARM DRYWALL12' MAIN 8\" OC FACETED (12/CTN)",
  "CGAXL8945P ARM DRYWALL I.D. 4' CR TEE (36/CTN) UNPAINTED",
  "CGAFZRC2AG ARM RADIUS CLIP (50/CTN)",

  // From catalog
  "1 1/2\"18 Ga Hi Hat / Furring Channel",
  "1 5/8\"20Ga Metal Stud",
  "1/2\" Cement",
  "R-11 Kraft",
  "Durabond 20,45,90",
  "Corner Bead",
  "5/8\" Fire",
  "5/8\" Mold Defense",
  "CDX PLYWOOD",
  "1-1/4\" Fine Screws",

  // Misc
  "Misc. Fuel Surcharge",
];

console.log("=== CATEGORIZATION TEST WITH REAL INVOICES ===\n");
console.log("CATEGORY         CONF  ITEM");
console.log("-".repeat(75));

let correct = 0;
let total = testItems.length;

for (const item of testItems) {
  const result = categorizeLineItem(item);
  const cat = result.category.padEnd(16);
  const conf = ((result.confidence * 100).toFixed(0) + "%").padStart(4);
  const desc = item.slice(0, 50);
  console.log(`${cat} ${conf}  ${desc}`);

  if (result.confidence >= 0.8) correct++;
}

console.log("-".repeat(75));
console.log(`\nMatched: ${correct}/${total} (${((correct/total)*100).toFixed(0)}%)`);

if (correct < total) {
  console.log("\nLow confidence items need keyword additions.");
}
