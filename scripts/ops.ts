#!/usr/bin/env npx tsx
/**
 * JobCost AI - Operational CLI
 *
 * Daily operations script for reviewing invoices, generating reports, and managing the system.
 *
 * Usage:
 *   npx tsx scripts/ops.ts <command> [options]
 *
 * Commands:
 *   status                    Show system status (pending invoices, recent activity)
 *   review                    List invoices needing review
 *   invoice <id>              Show invoice details
 *   approve <id>              Approve an invoice
 *   reject <id> [reason]      Reject an invoice
 *   projects                  List all projects
 *   report <projectId>        Generate cost report for a project
 *   weekly <companyId>        Generate weekly summary
 *   export <projectId>        Export project line items to CSV
 */

import "dotenv/config";

const BASE_URL = process.env.API_URL || "http://localhost:5050";
const COMPANY_ID = process.env.DEFAULT_COMPANY_ID || "";

async function api(endpoint: string, options?: RequestInit) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`API Error (${res.status}):`, data);
      process.exit(1);
    }
    return data;
  } catch (err: any) {
    console.error(`Request failed: ${url}`);
    console.error(err.message);
    process.exit(1);
  }
}

function formatCurrency(amount: string | number | null): string {
  if (amount === null || amount === undefined) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `$${num.toFixed(2)}`;
}

function formatDate(date: string | null): string {
  if (!date) return "N/A";
  return date;
}

function table(data: any[], columns: { key: string; header: string; width?: number }[]) {
  if (data.length === 0) {
    console.log("  (no data)");
    return;
  }

  // Calculate widths
  const widths = columns.map(col => {
    const maxData = Math.max(...data.map(row => String(row[col.key] ?? "").length));
    return col.width || Math.max(col.header.length, maxData, 4);
  });

  // Print header
  const header = columns.map((col, i) => col.header.padEnd(widths[i])).join(" | ");
  console.log(header);
  console.log(widths.map(w => "-".repeat(w)).join("-+-"));

  // Print rows
  for (const row of data) {
    const line = columns.map((col, i) => {
      const val = String(row[col.key] ?? "");
      return val.slice(0, widths[i]).padEnd(widths[i]);
    }).join(" | ");
    console.log(line);
  }
}

// ========== COMMANDS ==========

async function cmdStatus() {
  console.log("\n=== JOBCOST AI - SYSTEM STATUS ===\n");

  if (!COMPANY_ID) {
    console.log("Note: Set DEFAULT_COMPANY_ID in .env for faster operations\n");
    // List companies
    const companies = await api("/api/companies");
    console.log("Available Companies:");
    table(companies, [
      { key: "id", header: "ID", width: 36 },
      { key: "name", header: "Name", width: 30 },
    ]);
    return;
  }

  // Get company
  const company = await api(`/api/companies/${COMPANY_ID}`);
  console.log(`Company: ${company.name}`);

  // Get invoices needing review
  const needsReview = await api(`/api/invoices?companyId=${COMPANY_ID}&status=needs_review`);
  console.log(`\nInvoices Needing Review: ${needsReview.total}`);

  if (needsReview.total > 0) {
    console.log("\nTop 5 invoices needing review:");
    table(needsReview.invoices.slice(0, 5), [
      { key: "id", header: "ID", width: 12 },
      { key: "vendor", header: "Vendor", width: 25 },
      { key: "total", header: "Total", width: 10 },
      { key: "invoiceDate", header: "Date", width: 12 },
      { key: "reconciliationDelta", header: "Delta", width: 8 },
    ]);
  }

  // Get recent invoices
  const recent = await api(`/api/invoices?companyId=${COMPANY_ID}&limit=10`);
  console.log(`\nRecent Invoices (last 10):`);
  table(recent.invoices, [
    { key: "id", header: "ID", width: 12 },
    { key: "status", header: "Status", width: 14 },
    { key: "vendor", header: "Vendor", width: 25 },
    { key: "total", header: "Total", width: 10 },
    { key: "invoiceDate", header: "Date", width: 12 },
  ]);

  // Get projects
  const projects = await api(`/api/companies/${COMPANY_ID}/projects`);
  console.log(`\nProjects: ${projects.length}`);
}

async function cmdReview() {
  const companyId = COMPANY_ID || process.argv[3];
  if (!companyId) {
    console.error("Usage: ops.ts review <companyId> or set DEFAULT_COMPANY_ID");
    process.exit(1);
  }

  console.log("\n=== INVOICES NEEDING REVIEW ===\n");

  const result = await api(`/api/invoices?companyId=${companyId}&status=needs_review`);

  if (result.total === 0) {
    console.log("No invoices need review. Good job!");
    return;
  }

  console.log(`Found ${result.total} invoices needing review:\n`);

  for (const inv of result.invoices) {
    console.log(`ID: ${inv.id}`);
    console.log(`  Vendor: ${inv.vendor || "(unknown)"}`);
    console.log(`  Invoice #: ${inv.invoiceNumber || "(unknown)"}`);
    console.log(`  Date: ${formatDate(inv.invoiceDate)}`);
    console.log(`  Total: ${formatCurrency(inv.total)}`);
    console.log(`  Delta: ${inv.reconciliationDelta || "0.00"}`);
    console.log(`  Confidence: total=${inv.totalConfidence}, vendor=${inv.vendorConfidence}`);
    console.log("");
  }

  console.log("To review an invoice: npx tsx scripts/ops.ts invoice <id>");
  console.log("To approve: npx tsx scripts/ops.ts approve <id>");
}

async function cmdInvoice(invoiceId: string) {
  if (!invoiceId) {
    console.error("Usage: ops.ts invoice <invoiceId>");
    process.exit(1);
  }

  const result = await api(`/api/invoices/${invoiceId}`);
  const inv = result.invoice;

  console.log("\n=== INVOICE DETAILS ===\n");
  console.log(`ID: ${inv.id}`);
  console.log(`Status: ${inv.status}`);
  console.log(`Vendor: ${inv.vendor || "(unknown)"}`);
  console.log(`Invoice #: ${inv.invoiceNumber || "(unknown)"}`);
  console.log(`Date: ${formatDate(inv.invoiceDate)}`);
  console.log(`Project: ${inv.project?.name || "(not assigned)"}`);
  console.log("");
  console.log(`Subtotal: ${formatCurrency(inv.subtotal)}`);
  console.log(`Tax: ${formatCurrency(inv.tax)}`);
  console.log(`Shipping: ${formatCurrency(inv.shipping)}`);
  console.log(`Total: ${formatCurrency(inv.total)}`);
  console.log(`Reconciliation Delta: ${inv.reconciliationDelta || "0.00"}`);
  console.log("");
  console.log(`Extraction: ${inv.extractionMethod}`);
  console.log(`Total Confidence: ${inv.totalConfidence}`);
  console.log(`Vendor Confidence: ${inv.vendorConfidence}`);

  console.log("\n--- LINE ITEMS ---\n");

  if (result.lineItems.length === 0) {
    console.log("  (no line items)");
  } else {
    table(result.lineItems, [
      { key: "category", header: "Category", width: 15 },
      { key: "description", header: "Description", width: 40 },
      { key: "quantity", header: "Qty", width: 8 },
      { key: "lineAmount", header: "Amount", width: 10 },
    ]);
  }

  console.log("\n--- ACTIONS ---");
  console.log(`  Approve: npx tsx scripts/ops.ts approve ${invoiceId}`);
  console.log(`  Reject:  npx tsx scripts/ops.ts reject ${invoiceId} "reason"`);
}

async function cmdApprove(invoiceId: string) {
  if (!invoiceId) {
    console.error("Usage: ops.ts approve <invoiceId>");
    process.exit(1);
  }

  const result = await api(`/api/invoices/${invoiceId}/approve`, { method: "POST" });
  console.log(`Invoice ${invoiceId} approved.`);
}

async function cmdReject(invoiceId: string, reason?: string) {
  if (!invoiceId) {
    console.error("Usage: ops.ts reject <invoiceId> [reason]");
    process.exit(1);
  }

  const result = await api(`/api/invoices/${invoiceId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "Rejected via CLI" }),
  });
  console.log(`Invoice ${invoiceId} rejected.`);
}

async function cmdProjects() {
  const companyId = COMPANY_ID || process.argv[3];
  if (!companyId) {
    console.error("Usage: ops.ts projects <companyId> or set DEFAULT_COMPANY_ID");
    process.exit(1);
  }

  console.log("\n=== PROJECTS ===\n");

  const projects = await api(`/api/companies/${companyId}/projects`);

  if (projects.length === 0) {
    console.log("No projects found.");
    return;
  }

  table(projects, [
    { key: "id", header: "ID", width: 36 },
    { key: "name", header: "Name", width: 30 },
    { key: "externalRef", header: "Ref", width: 15 },
    { key: "status", header: "Status", width: 10 },
  ]);

  console.log("\nTo see cost report: npx tsx scripts/ops.ts report <projectId>");
}

async function cmdReport(projectId: string) {
  if (!projectId) {
    console.error("Usage: ops.ts report <projectId>");
    process.exit(1);
  }

  const result = await api(`/api/projects/${projectId}/cost-report`);

  console.log("\n=== PROJECT COST REPORT ===\n");
  console.log(`Project: ${result.project.name}`);
  console.log(`Status: ${result.project.status}`);
  console.log("");

  console.log("--- SUMMARY ---");
  console.log(`  Total Material Cost: ${formatCurrency(result.summary.totalMaterialCost)}`);
  console.log(`  Total Labor Cost: ${formatCurrency(result.summary.totalLaborCost)}`);
  console.log(`  Total Labor Hours: ${result.summary.totalLaborHours.toFixed(2)}`);
  console.log(`  TOTAL COST: ${formatCurrency(result.summary.totalCost)}`);
  console.log(`  Invoices: ${result.summary.invoiceCount}`);
  console.log(`  Line Items: ${result.summary.lineItemCount}`);
  console.log(`  Labor Entries: ${result.summary.laborEntryCount}`);

  console.log("\n--- MATERIALS BY CATEGORY ---");
  const categories = Object.entries(result.materials.byCategory).map(([cat, amt]) => ({
    category: cat,
    amount: formatCurrency(amt as number),
  }));
  if (categories.length > 0) {
    table(categories, [
      { key: "category", header: "Category", width: 20 },
      { key: "amount", header: "Amount", width: 12 },
    ]);
  } else {
    console.log("  (no materials)");
  }

  console.log("\n--- TOP VENDORS ---");
  if (result.materials.topVendors.length > 0) {
    table(result.materials.topVendors.map((v: any) => ({
      vendor: v.vendor,
      total: formatCurrency(v.total),
    })), [
      { key: "vendor", header: "Vendor", width: 30 },
      { key: "total", header: "Total", width: 12 },
    ]);
  } else {
    console.log("  (no vendors)");
  }

  console.log("\n--- LABOR BY WORKER ---");
  if (result.labor.byWorker.length > 0) {
    table(result.labor.byWorker.map((w: any) => ({
      worker: w.worker,
      hours: w.hours.toFixed(2),
      cost: formatCurrency(w.cost),
      roles: w.roles.join(", "),
    })), [
      { key: "worker", header: "Worker", width: 20 },
      { key: "hours", header: "Hours", width: 8 },
      { key: "cost", header: "Cost", width: 10 },
      { key: "roles", header: "Roles", width: 25 },
    ]);
  } else {
    console.log("  (no labor entries)");
  }

  console.log("\n--- LABOR BY ROLE ---");
  if (result.labor.byRole.length > 0) {
    table(result.labor.byRole.map((r: any) => ({
      role: r.role,
      hours: r.hours.toFixed(2),
      cost: formatCurrency(r.cost),
    })), [
      { key: "role", header: "Role", width: 20 },
      { key: "hours", header: "Hours", width: 8 },
      { key: "cost", header: "Cost", width: 10 },
    ]);
  } else {
    console.log("  (no labor entries)");
  }

  console.log(`\nTo export CSV: npx tsx scripts/ops.ts export ${projectId}`);
}

async function cmdWeekly(companyId?: string) {
  const cid = companyId || COMPANY_ID;
  if (!cid) {
    console.error("Usage: ops.ts weekly <companyId> or set DEFAULT_COMPANY_ID");
    process.exit(1);
  }

  // Get current week (Monday to Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStart = monday.toISOString().split("T")[0];
  const weekEnd = sunday.toISOString().split("T")[0];

  console.log(`\n=== WEEKLY SUMMARY (${weekStart} to ${weekEnd}) ===\n`);

  const result = await api(`/api/companies/${cid}/reports/weekly/summary?weekStart=${weekStart}&weekEnd=${weekEnd}`);

  console.log(`Total Cost: ${formatCurrency(result.totalCost)}`);
  console.log(`Total Revenue: ${formatCurrency(result.totalRevenue)}`);
  console.log(`Gross Margin: ${result.grossMargin?.toFixed(1) || 0}%`);
  console.log("");
  console.log(`Labor Cost: ${formatCurrency(result.laborCost)}`);
  console.log(`Material Cost: ${formatCurrency(result.materialCost)}`);
  console.log(`Equipment Cost: ${formatCurrency(result.equipmentCost)}`);

  if (result.alerts && result.alerts.length > 0) {
    console.log("\n--- ALERTS ---");
    for (const alert of result.alerts) {
      console.log(`  ! ${alert}`);
    }
  }

  console.log(`\nTo export CSV: curl "${BASE_URL}/api/companies/${cid}/reports/weekly/csv?weekStart=${weekStart}&weekEnd=${weekEnd}" > weekly.csv`);
}

async function cmdExport(projectId: string) {
  if (!projectId) {
    console.error("Usage: ops.ts export <projectId>");
    process.exit(1);
  }

  const url = `${BASE_URL}/api/projects/${projectId}/line-items/export?format=csv`;
  console.log(`Exporting to: project_${projectId}.csv`);
  console.log(`Download URL: ${url}`);

  // Actually fetch and save
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Export failed:", await res.text());
    process.exit(1);
  }

  const csv = await res.text();
  const filename = `project_${projectId}_${new Date().toISOString().split("T")[0]}.csv`;

  const fs = await import("fs");
  fs.writeFileSync(filename, csv);
  console.log(`Saved to: ${filename}`);
  console.log(`Lines: ${csv.split("\n").length}`);
}

function showHelp() {
  console.log(`
JobCost AI - Operational CLI

Usage:
  npx tsx scripts/ops.ts <command> [options]

Commands:
  status                    Show system status (pending invoices, recent activity)
  review                    List invoices needing review
  invoice <id>              Show invoice details with line items
  approve <id>              Approve an invoice
  reject <id> [reason]      Reject an invoice
  projects                  List all projects
  report <projectId>        Generate cost report for a project
  weekly [companyId]        Generate weekly summary
  export <projectId>        Export project line items to CSV

Environment:
  DEFAULT_COMPANY_ID        Set in .env to skip company selection
  API_URL                   API base URL (default: http://localhost:5050)

Examples:
  npx tsx scripts/ops.ts status
  npx tsx scripts/ops.ts review
  npx tsx scripts/ops.ts invoice abc123
  npx tsx scripts/ops.ts approve abc123
  npx tsx scripts/ops.ts report proj-456
  npx tsx scripts/ops.ts export proj-456
`);
}

// ========== MAIN ==========

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "status":
      await cmdStatus();
      break;
    case "review":
      await cmdReview();
      break;
    case "invoice":
      await cmdInvoice(process.argv[3]);
      break;
    case "approve":
      await cmdApprove(process.argv[3]);
      break;
    case "reject":
      await cmdReject(process.argv[3], process.argv[4]);
      break;
    case "projects":
      await cmdProjects();
      break;
    case "report":
      await cmdReport(process.argv[3]);
      break;
    case "weekly":
      await cmdWeekly(process.argv[3]);
      break;
    case "export":
      await cmdExport(process.argv[3]);
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      showHelp();
      process.exit(command ? 1 : 0);
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
