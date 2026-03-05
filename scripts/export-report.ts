#!/usr/bin/env npx tsx
/**
 * Export Invoice Line Items to CSV - Grouped by Project
 * Run: npx tsx scripts/export-report.ts
 */

import "dotenv/config";
import { db } from "../server/db";
import { invoices, invoiceLineItems, projects, companies } from "../shared/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";

async function exportReport() {
  console.log("\n📊 TREBOL CONTRACTORS - INVOICE REPORT\n");
  console.log("=".repeat(70));

  // Get company
  const allCompanies = await db.select().from(companies);
  if (allCompanies.length === 0) {
    console.log("❌ No companies found. Run fresh-start.ts first.");
    process.exit(1);
  }
  const company = allCompanies[0];
  console.log(`\n🏢 Company: ${company.name}`);

  // Get all projects
  const allProjects = await db.select().from(projects).where(eq(projects.companyId, company.id));
  console.log(`📁 Projects: ${allProjects.map(p => p.name).join(", ")}`);

  // Get all invoices
  const allInvoices = await db.select().from(invoices).where(eq(invoices.companyId, company.id));
  console.log(`📄 Invoices: ${allInvoices.length}`);

  // ========== CSV REPORT ==========
  const csvLines: string[] = [
    "Project,Invoice Date,Vendor,Invoice #,Category,Description,Qty,Unit Price,Line Total,Invoice Total"
  ];

  // ========== GROUP BY PROJECT ==========
  const projectSummaries: Record<string, { name: string; total: number; categories: Record<string, number> }> = {};

  for (const inv of allInvoices) {
    const project = allProjects.find(p => p.id === inv.projectId);
    const projectName = project?.name || inv.jobName || "Unassigned";

    if (!projectSummaries[projectName]) {
      projectSummaries[projectName] = { name: projectName, total: 0, categories: {} };
    }

    // Get line items
    const items = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, inv.id));

    for (const item of items) {
      // Add to CSV
      csvLines.push([
        `"${projectName}"`,
        inv.invoiceDate || "",
        `"${inv.vendor || ""}"`,
        inv.invoiceNumber || "",
        item.category || "misc",
        `"${(item.description || "").replace(/"/g, '""')}"`,
        item.quantity || "",
        item.unitPrice || "",
        item.lineAmount || "",
        inv.total || ""
      ].join(","));

      // Track for summary
      const amount = parseFloat(item.lineAmount || "0");
      projectSummaries[projectName].total += amount;
      projectSummaries[projectName].categories[item.category || "misc"] =
        (projectSummaries[projectName].categories[item.category || "misc"] || 0) + amount;
    }
  }

  // Write CSV
  const csvContent = csvLines.join("\n");
  const outputPath = "/Users/hectorpulido/Downloads/trebol_invoice_report.csv";
  fs.writeFileSync(outputPath, csvContent);

  // ========== PRINT SUMMARY ==========
  console.log("\n" + "=".repeat(70));
  console.log("📊 SPEND BY PROJECT");
  console.log("=".repeat(70));

  let grandTotal = 0;

  for (const [projectName, summary] of Object.entries(projectSummaries).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`\n📁 ${projectName.toUpperCase()}`);
    console.log(`   Total: $${summary.total.toFixed(2)}`);
    console.log(`   By Category:`);

    for (const [cat, amount] of Object.entries(summary.categories).sort((a, b) => b[1] - a[1])) {
      const pct = ((amount / summary.total) * 100).toFixed(1);
      console.log(`      ${cat.padEnd(18)} $${amount.toFixed(2).padStart(10)} (${pct}%)`);
    }

    grandTotal += summary.total;
  }

  console.log("\n" + "=".repeat(70));
  console.log(`💰 GRAND TOTAL: $${grandTotal.toFixed(2)}`);
  console.log("=".repeat(70));

  console.log(`\n✅ CSV Report saved to: ${outputPath}`);
  console.log("\nOpen it in Excel or Numbers to view all details!\n");

  process.exit(0);
}

exportReport().catch(console.error);
