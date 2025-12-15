import { db } from "../server/db";
import { companies, projects, transactions, laborEntries } from "../shared/schema";

async function seed() {
  console.log("Starting database seed...");

  const existingCompanies = await db.select().from(companies);
  if (existingCompanies.length > 0) {
    console.log("Database already has data. Skipping seed.");
    process.exit(0);
  }

  const [company] = await db.insert(companies).values({
    name: "ABC Construction Co.",
    email: "info@abcconstruction.com",
    timezone: "America/New_York"
  }).returning();

  console.log(`Created company: ${company.name} (${company.id})`);

  const [project1] = await db.insert(projects).values({
    companyId: company.id,
    name: "Downtown Office Renovation",
    status: "active",
    startDate: "2024-10-01",
    endDate: "2025-03-31"
  }).returning();

  const [project2] = await db.insert(projects).values({
    companyId: company.id,
    name: "Riverside Apartments",
    status: "active",
    startDate: "2024-11-15",
    endDate: "2025-06-30"
  }).returning();

  const [project3] = await db.insert(projects).values({
    companyId: company.id,
    name: "Highway Bridge Repair",
    status: "active",
    startDate: "2024-12-01",
    endDate: "2025-02-28"
  }).returning();

  console.log(`Created ${3} projects`);

  const now = new Date();
  const weekDates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    weekDates.push(d.toISOString().split('T')[0]);
  }

  const demoTransactions = [
    { projectId: project1.id, type: "expense", direction: "out", amount: "12500.00", category: "labor", description: "Electrician crew - Week 1", vendor: "ElectroPro Services", txnDate: weekDates[1] },
    { projectId: project1.id, type: "expense", direction: "out", amount: "8750.00", category: "material", description: "Drywall and finishing materials", vendor: "BuildMart Supply", txnDate: weekDates[2] },
    { projectId: project1.id, type: "expense", direction: "out", amount: "3200.00", category: "equipment", description: "Scissor lift rental", vendor: "Equipment Rentals Inc", txnDate: weekDates[3] },
    { projectId: project1.id, type: "income", direction: "in", amount: "45000.00", category: "payment", description: "Progress payment - Phase 2", vendor: "Client: Downtown Holdings", txnDate: weekDates[4] },
    { projectId: project2.id, type: "expense", direction: "out", amount: "18900.00", category: "labor", description: "Framing crew", vendor: "Skilled Trades LLC", txnDate: weekDates[1] },
    { projectId: project2.id, type: "expense", direction: "out", amount: "22400.00", category: "material", description: "Lumber and framing materials", vendor: "Premium Lumber Co", txnDate: weekDates[2] },
    { projectId: project2.id, type: "expense", direction: "out", amount: "5600.00", category: "equipment", description: "Crane rental - 2 days", vendor: "Heavy Equipment Rentals", txnDate: weekDates[5] },
    { projectId: project2.id, type: "income", direction: "in", amount: "75000.00", category: "payment", description: "Milestone payment - Foundation complete", vendor: "Client: Riverside Development", txnDate: weekDates[3] },
    { projectId: project3.id, type: "expense", direction: "out", amount: "9800.00", category: "labor", description: "Concrete crew", vendor: "Bridge Works Inc", txnDate: weekDates[2] },
    { projectId: project3.id, type: "expense", direction: "out", amount: "15600.00", category: "material", description: "Concrete and rebar", vendor: "Concrete Supply Co", txnDate: weekDates[4] },
    { projectId: project3.id, type: "expense", direction: "out", amount: "8200.00", category: "equipment", description: "Concrete pump rental", vendor: "Construction Equipment Co", txnDate: weekDates[6] },
    { projectId: project3.id, type: "income", direction: "in", amount: "55000.00", category: "payment", description: "State DOT progress payment", vendor: "State Highway Dept", txnDate: weekDates[5] },
    { projectId: project1.id, type: "expense", direction: "out", amount: "6500.00", category: "labor", description: "Plumbing crew", vendor: "PipeMaster Plumbing", txnDate: weekDates[7] },
    { projectId: project1.id, type: "expense", direction: "out", amount: "4200.00", category: "material", description: "Plumbing fixtures", vendor: "Wholesale Plumbing Supply", txnDate: weekDates[8] },
    { projectId: project2.id, type: "expense", direction: "out", amount: "11200.00", category: "labor", description: "HVAC installation crew", vendor: "Climate Control Systems", txnDate: weekDates[9] },
    { projectId: project2.id, type: "expense", direction: "out", amount: "28500.00", category: "material", description: "HVAC units and ductwork", vendor: "HVAC Distributors Inc", txnDate: weekDates[10] }
  ];

  const txnsToCreate = demoTransactions.map(t => ({
    companyId: company.id,
    projectId: t.projectId,
    type: t.type,
    direction: t.direction,
    amount: t.amount,
    category: t.category,
    description: t.description,
    vendor: t.vendor,
    txnDate: t.txnDate,
    source: "seed"
  }));

  await db.insert(transactions).values(txnsToCreate);
  console.log(`Created ${txnsToCreate.length} transactions`);

  const demoLaborEntries = [
    { projectId: project1.id, workerName: "John Smith", role: "Electrician", hours: "40", rate: "65.00", laborDate: weekDates[1] },
    { projectId: project1.id, workerName: "Mike Johnson", role: "Electrician Helper", hours: "40", rate: "35.00", laborDate: weekDates[1] },
    { projectId: project2.id, workerName: "Carlos Garcia", role: "Framing Lead", hours: "45", rate: "55.00", laborDate: weekDates[2] },
    { projectId: project2.id, workerName: "David Lee", role: "Framer", hours: "42", rate: "40.00", laborDate: weekDates[2] },
    { projectId: project3.id, workerName: "Robert Brown", role: "Concrete Finisher", hours: "38", rate: "50.00", laborDate: weekDates[3] }
  ];

  const laborToCreate = demoLaborEntries.map(l => ({
    companyId: company.id,
    projectId: l.projectId,
    workerName: l.workerName,
    role: l.role,
    hours: l.hours,
    rate: l.rate,
    laborDate: l.laborDate,
    source: "seed"
  }));

  await db.insert(laborEntries).values(laborToCreate);
  console.log(`Created ${laborToCreate.length} labor entries`);

  console.log("\nSeed completed successfully!");
  console.log(`Company ID: ${company.id}`);
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
