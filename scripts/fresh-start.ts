#!/usr/bin/env npx tsx
/**
 * Fresh Start - Reset DB and set up Trebol Contractors
 * Run: npx tsx -r dotenv/config scripts/fresh-start.ts
 */

import "dotenv/config";
import { db } from "../server/db";
import { companies, projects, invoices, invoiceLineItems, vendors, ingestionJobs } from "../shared/schema";
import { sql } from "drizzle-orm";

async function freshStart() {
  console.log("\n🔄 FRESH START - Trebol Contractors Setup\n");
  console.log("=" .repeat(50));

  // 1. Clear all data
  console.log("\n🗑️  Clearing existing data...");
  await db.delete(invoiceLineItems);
  await db.delete(invoices);
  await db.delete(ingestionJobs);
  await db.delete(vendors);
  await db.delete(projects);
  await db.delete(companies);
  console.log("   ✅ All tables cleared");

  // 2. Create Trebol Contractors Corp
  console.log("\n🏗️  Creating Trebol Contractors Corp...");
  const [company] = await db.insert(companies).values({
    name: "Trebol Contractors Corp",
    email: "invoices@trebolcontractors.com",
    timezone: "America/New_York",
    ingestionEmailAlias: "invoices",
  }).returning();
  console.log(`   ✅ Company ID: ${company.id}`);

  // 3. Create Projects
  console.log("\n📁 Creating projects...");

  const [coachProject] = await db.insert(projects).values({
    companyId: company.id,
    name: "COACH",
    externalRef: "COACH-PEMBROKE-PINES",
    status: "active",
  }).returning();
  console.log(`   ✅ COACH Project ID: ${coachProject.id}`);

  const [zaraProject] = await db.insert(projects).values({
    companyId: company.id,
    name: "ZARA",
    externalRef: "ZARA-MIAMI",
    status: "active",
  }).returning();
  console.log(`   ✅ ZARA Project ID: ${zaraProject.id}`);

  // 4. Create common vendors
  console.log("\n🏪 Creating vendors...");

  const [fbmVendor] = await db.insert(vendors).values({
    companyId: company.id,
    name: "Foundation Building Materials",
    nameNormalized: "foundation building materials",
  }).returning();
  console.log(`   ✅ FBM Vendor ID: ${fbmVendor.id}`);

  const [bannerVendor] = await db.insert(vendors).values({
    companyId: company.id,
    name: "Banner Supply Co",
    nameNormalized: "banner supply co",
  }).returning();
  console.log(`   ✅ Banner Supply Vendor ID: ${bannerVendor.id}`);

  const [homeDepotVendor] = await db.insert(vendors).values({
    companyId: company.id,
    name: "The Home Depot",
    nameNormalized: "the home depot",
  }).returning();
  console.log(`   ✅ Home Depot Vendor ID: ${homeDepotVendor.id}`);

  // Summary
  console.log("\n" + "=" .repeat(50));
  console.log("✅ SETUP COMPLETE!\n");
  console.log("📋 Save these IDs:\n");
  console.log(`   COMPANY_ID=${company.id}`);
  console.log(`   COACH_PROJECT_ID=${coachProject.id}`);
  console.log(`   ZARA_PROJECT_ID=${zaraProject.id}`);
  console.log(`   FBM_VENDOR_ID=${fbmVendor.id}`);
  console.log(`   BANNER_VENDOR_ID=${bannerVendor.id}`);
  console.log(`   HOMEDEPOT_VENDOR_ID=${homeDepotVendor.id}`);

  console.log("\n📝 Update your .env file with:");
  console.log(`   COMPANY_ID=${company.id}`);

  console.log("\n🚀 Next steps:");
  console.log("   1. Start server: npm run dev");
  console.log("   2. Upload invoices using the process-invoices.sh script");
  console.log("");

  process.exit(0);
}

freshStart().catch(console.error);
