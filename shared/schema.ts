import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, numeric, date, timestamp, boolean, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  timezone: text("timezone").notNull().default("America/New_York"),
  ingestionEmailAlias: text("ingestion_email_alias"),
  // Stripe subscription
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("trialing"), // trialing, active, past_due, canceled
  subscriptionPlan: text("subscription_plan").default("starter"), // starter, pro, enterprise
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ========== USERS (Firebase Auth) ==========
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firebaseUid: text("firebase_uid").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

// ========== USER-COMPANY RELATIONSHIP (Multi-tenancy) ==========
export const userCompanies = pgTable("user_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // owner, admin, member
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

export const usersRelations = relations(users, ({ many }) => ({
  userCompanies: many(userCompanies),
}));

export const userCompaniesRelations = relations(userCompanies, ({ one }) => ({
  user: one(users, { fields: [userCompanies.userId], references: [users.id] }),
  company: one(companies, { fields: [userCompanies.companyId], references: [companies.id] }),
}));


export const ingestionJobs = pgTable("ingestion_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  companyId: varchar("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),

  sourceType: text("source_type").notNull(),

  status: text("status").notNull(),

  filename: text("filename").notNull(),

  fileUrl: text("file_url").notNull(),

  extractedText: text("extracted_text"),

  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  processedAt: timestamp("processed_at"),

  finalCategorizedResultId: varchar("final_categorized_result_id"),
  finalParsedResultId: varchar("final_parsed_result_id"),

  // Review queue fields
  needsReview: boolean("needs_review").default(false),
  reviewReason: text("review_reason"),
  reviewStatus: text("review_status").default("pending"),
  reviewedAt: timestamp("reviewed_at"),
  overrideTotal: numeric("override_total", { precision: 12, scale: 2 }),
  overrideVendorName: text("override_vendor_name"),
});


export const companiesRelations = relations(companies, ({ many, one }) => ({
  projects: many(projects),
  transactions: many(transactions),
  vendors: many(vendors),
  laborEntries: many(laborEntries),
  invoices: many(invoices),
  invoiceLineItems: many(invoiceLineItems),
  weeklyReports: many(weeklyReports),
  importFiles: many(importFiles),
  ingestionJobs: many(ingestionJobs),
  settings: one(companySettings),
  qbConnection: one(qbConnections),
  generalContractors: many(generalContractors),
  workers: many(workers),
  payrollEntries: many(payrollEntries),
}));

// ========== GENERAL CONTRACTORS (GCs that hire Trebol) ==========
export const generalContractors = pgTable("general_contractors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // CH Construction, Dickinson Cameron, etc.
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  // Payment terms
  paymentTermsDays: numeric("payment_terms_days").default("45"), // Typically 45 days
  invoiceDueDay: text("invoice_due_day"), // "before 25th of month"
  // Billing method
  billingMethod: text("billing_method").default("progress"), // progress, milestone, fixed
  retentionPercent: numeric("retention_percent", { precision: 5, scale: 2 }).default("10"), // Typically 10%
  // Notes
  notes: text("notes"),
  status: text("status").notNull().default("active"), // active, inactive
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const generalContractorsRelations = relations(generalContractors, ({ one, many }) => ({
  company: one(companies, { fields: [generalContractors.companyId], references: [companies.id] }),
  projects: many(projects),
  changeOrders: many(changeOrders),
  projectInvoices: many(projectInvoices),
}));

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  gcId: varchar("gc_id").references(() => generalContractors.id, { onDelete: "set null" }), // Link to GC
  name: text("name").notNull(),
  externalRef: text("external_ref"), // Job Name / Customer PO for matching
  address: text("address"), // Project/job site address
  // Point of Contact (PM for this specific project, may differ from GC contact)
  pocName: text("poc_name"), // Project Manager / Point of Contact name
  pocPhone: text("poc_phone"),
  pocEmail: text("poc_email"),
  // Contract values
  initialProposal: numeric("initial_proposal", { precision: 14, scale: 2 }), // Original contract amount
  noticeToOwner: boolean("notice_to_owner").default(false), // Legal requirement
  // Progress tracking (manually entered by boss - "by eye" estimate)
  percentComplete: numeric("percent_complete", { precision: 5, scale: 2 }).default("0"), // Current % complete
  // Status and dates
  status: text("status").notNull().default("active"), // active, completed, on_hold, cancelled
  startDate: date("start_date"),
  endDate: date("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, { fields: [projects.companyId], references: [companies.id] }),
  gc: one(generalContractors, { fields: [projects.gcId], references: [generalContractors.id] }),
  transactions: many(transactions),
  laborEntries: many(laborEntries),
  invoices: many(invoices),
  changeOrders: many(changeOrders),
  projectInvoices: many(projectInvoices),
  paymentsReceived: many(paymentsReceived),
  payrollEntries: many(payrollEntries),
}));

export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  company: one(companies, { fields: [vendors.companyId], references: [companies.id] }),
  transactions: many(transactions),
}));

// ========== CHANGE ORDERS ==========
// Additional work requested by GC after initial contract
export const changeOrders = pgTable("change_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  gcId: varchar("gc_id").references(() => generalContractors.id, { onDelete: "set null" }),
  // CO identification
  coNumber: text("co_number").notNull(), // #1, #2, #3 (per project)
  poNumber: text("po_number"), // GC's PO number for this change order (optional)
  description: text("description"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // Status tracking
  dateSubmitted: date("date_submitted"),
  dateApproved: date("date_approved"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected, invoiced
  // Link to invoice when billed
  invoicedInId: varchar("invoiced_in_id"), // Reference to project_invoices.id (added later to avoid circular)
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const changeOrdersRelations = relations(changeOrders, ({ one }) => ({
  company: one(companies, { fields: [changeOrders.companyId], references: [companies.id] }),
  project: one(projects, { fields: [changeOrders.projectId], references: [projects.id] }),
  gc: one(generalContractors, { fields: [changeOrders.gcId], references: [generalContractors.id] }),
}));

// ========== PROJECT INVOICES (Invoices Trebol sends TO the GC) ==========
export const projectInvoices = pgTable("project_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  gcId: varchar("gc_id").references(() => generalContractors.id, { onDelete: "set null" }),
  // Invoice identification
  invoiceNumber: text("invoice_number").notNull(), // #1100, #1101, App #1
  poNumber: text("po_number"), // GC's PO number - we reference this on our invoice so they know what we're charging
  invoiceDate: date("invoice_date").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  // Progress billing info
  percentBilled: numeric("percent_billed", { precision: 5, scale: 2 }), // What % of contract this represents
  cumulativePercent: numeric("cumulative_percent", { precision: 5, scale: 2 }), // Total % invoiced so far
  // Retainage tracking
  retainagePercent: numeric("retainage_percent", { precision: 5, scale: 2 }), // Typically 5-10%
  retainageAmount: numeric("retainage_amount", { precision: 14, scale: 2 }), // Amount withheld
  retainageReleased: boolean("retainage_released").default(false), // Has retainage been released?
  retainageReleasedDate: date("retainage_released_date"),
  // Change orders included
  includesChangeOrders: jsonb("includes_change_orders"), // Array of CO ids included
  // Type of invoice
  billingType: text("billing_type").default("progress"), // progress, change_order, final, retainage
  // Status tracking
  status: text("status").notNull().default("draft"), // draft, sent, partial, paid
  dueDate: date("due_date"), // Calculated: invoice_date + payment_terms_days
  // Where invoice was submitted
  submittedVia: text("submitted_via"), // "Procoro", "Email", "Hand delivered"
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectInvoicesRelations = relations(projectInvoices, ({ one, many }) => ({
  company: one(companies, { fields: [projectInvoices.companyId], references: [companies.id] }),
  project: one(projects, { fields: [projectInvoices.projectId], references: [projects.id] }),
  gc: one(generalContractors, { fields: [projectInvoices.gcId], references: [generalContractors.id] }),
  payments: many(paymentsReceived),
}));

// ========== PAYMENTS RECEIVED (From GC) ==========
export const paymentsReceived = pgTable("payments_received", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  projectInvoiceId: varchar("project_invoice_id").references(() => projectInvoices.id, { onDelete: "set null" }),
  // Payment details
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: text("payment_method"), // ACH, Check, Wire
  referenceNumber: text("reference_number"), // Check #00001, ACH ref
  bankDeposited: text("bank_deposited"), // Chase, TD Bank, Wells Fargo
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentsReceivedRelations = relations(paymentsReceived, ({ one }) => ({
  company: one(companies, { fields: [paymentsReceived.companyId], references: [companies.id] }),
  project: one(projects, { fields: [paymentsReceived.projectId], references: [projects.id] }),
  projectInvoice: one(projectInvoices, { fields: [paymentsReceived.projectInvoiceId], references: [projectInvoices.id] }),
}));

// ========== ESTIMATES/PROPOSALS ==========
export const estimates = pgTable("estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  gcId: varchar("gc_id").references(() => generalContractors.id, { onDelete: "set null" }),
  // Estimate identification
  estimateNumber: text("estimate_number").notNull(), // EST-001, Proposal #123
  name: text("name").notNull(), // Project name / description
  // Client info (can be a GC or direct client)
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  clientAddress: text("client_address"),
  // Project details
  projectAddress: text("project_address"), // Job site address
  scopeOfWork: text("scope_of_work"), // Detailed description of work
  // Pricing
  laborCost: numeric("labor_cost", { precision: 14, scale: 2 }),
  materialCost: numeric("material_cost", { precision: 14, scale: 2 }),
  equipmentCost: numeric("equipment_cost", { precision: 14, scale: 2 }),
  overhead: numeric("overhead", { precision: 14, scale: 2 }),
  profit: numeric("profit", { precision: 14, scale: 2 }),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  // Dates
  estimateDate: date("estimate_date").notNull(),
  validUntil: date("valid_until"), // Expiration date
  // Status tracking
  status: text("status").notNull().default("draft"), // draft, sent, viewed, accepted, rejected, expired
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  respondedAt: timestamp("responded_at"),
  // If accepted, link to created project
  convertedToProjectId: varchar("converted_to_project_id").references(() => projects.id, { onDelete: "set null" }),
  // Terms and notes
  paymentTerms: text("payment_terms"),
  inclusions: text("inclusions"), // What's included
  exclusions: text("exclusions"), // What's NOT included
  notes: text("notes"),
  // PDF storage
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const estimatesRelations = relations(estimates, ({ one }) => ({
  company: one(companies, { fields: [estimates.companyId], references: [companies.id] }),
  gc: one(generalContractors, { fields: [estimates.gcId], references: [generalContractors.id] }),
  project: one(projects, { fields: [estimates.convertedToProjectId], references: [projects.id] }),
}));

// Estimate line items for detailed breakdowns
export const estimateLineItems = pgTable("estimate_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  category: text("category"), // labor, material, equipment, subcontract, other
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  unit: text("unit"), // ea, sf, lf, hr, day
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  totalPrice: numeric("total_price", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  sortOrder: numeric("sort_order").default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const estimateLineItemsRelations = relations(estimateLineItems, ({ one }) => ({
  estimate: one(estimates, { fields: [estimateLineItems.estimateId], references: [estimates.id] }),
}));

// ========== WORKERS (Employees/Subcontractors) ==========
export const workers = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Worker's full name
  dailyRate: numeric("daily_rate", { precision: 8, scale: 2 }), // Default daily rate (can be overridden per entry)
  role: text("role"), // framer, finisher, supervisor, helper, nocturno (night shift)
  phone: text("phone"),
  email: text("email"),
  // Worker can be employee or subcontractor
  workerType: text("worker_type").default("employee"), // employee, subcontractor
  status: text("status").notNull().default("active"), // active, inactive
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workersRelations = relations(workers, ({ one, many }) => ({
  company: one(companies, { fields: [workers.companyId], references: [companies.id] }),
  payrollEntries: many(payrollEntries),
}));

// ========== PAYROLL ENTRIES (Weekly labor per project per worker) ==========
// One entry = one worker's work on one project for one week
export const payrollEntries = pgTable("payroll_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  workerId: varchar("worker_id").notNull().references(() => workers.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  // Week identification
  weekStart: date("week_start").notNull(), // Monday of the week
  weekEnd: date("week_end").notNull(), // Sunday of the week
  // Work details
  daysWorked: numeric("days_worked", { precision: 3, scale: 1 }).notNull(), // Can be 0.5 for half days
  dailyRate: numeric("daily_rate", { precision: 8, scale: 2 }).notNull(), // Rate at time of entry
  basePay: numeric("base_pay", { precision: 10, scale: 2 }).notNull(), // days_worked * daily_rate
  // Bonuses
  parking: numeric("parking", { precision: 8, scale: 2 }).default("0"),
  overtimeHours: numeric("overtime_hours", { precision: 4, scale: 1 }).default("0"),
  overtimePay: numeric("overtime_pay", { precision: 8, scale: 2 }).default("0"),
  bonus: numeric("bonus", { precision: 8, scale: 2 }).default("0"),
  // Deductions
  deductions: numeric("deductions", { precision: 8, scale: 2 }).default("0"),
  deductionNotes: text("deduction_notes"),
  // Total
  totalPay: numeric("total_pay", { precision: 10, scale: 2 }).notNull(), // basePay + parking + overtimePay + bonus - deductions
  // Source tracking for Excel imports
  source: text("source").default("manual"), // manual, excel_import
  sourceRef: text("source_ref"), // Excel filename, batch ID
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payrollEntriesRelations = relations(payrollEntries, ({ one }) => ({
  company: one(companies, { fields: [payrollEntries.companyId], references: [companies.id] }),
  worker: one(workers, { fields: [payrollEntries.workerId], references: [workers.id] }),
  project: one(projects, { fields: [payrollEntries.projectId], references: [projects.id] }),
}));

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  vendorId: varchar("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  txnDate: date("txn_date").notNull(),
  category: text("category"),
  description: text("description"),
  memo: text("memo"),
  vendor: text("vendor"),
  source: text("source").notNull().default("seed"),
  sourceRef: text("source_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  company: one(companies, { fields: [transactions.companyId], references: [companies.id] }),
  project: one(projects, { fields: [transactions.projectId], references: [projects.id] }),
  vendorRef: one(vendors, { fields: [transactions.vendorId], references: [vendors.id] }),
}));

export const laborEntries = pgTable("labor_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  workerName: text("worker_name"),
  role: text("role"),
  hours: numeric("hours", { precision: 8, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 10, scale: 2 }),
  laborDate: date("labor_date").notNull(),
  source: text("source").notNull().default("seed"),
  sourceRef: text("source_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const laborEntriesRelations = relations(laborEntries, ({ one }) => ({
  company: one(companies, { fields: [laborEntries.companyId], references: [companies.id] }),
  project: one(projects, { fields: [laborEntries.projectId], references: [projects.id] }),
}));

// ========== INVOICES TABLE ==========
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
  vendorId: varchar("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  vendor: text("vendor"), // Original vendor name from OCR
  invoiceNumber: text("invoice_number"), // Original invoice number as extracted
  invoiceNumberNorm: text("invoice_number_norm"), // Normalized for dedupe (uppercase, trimmed, dashes normalized)
  invoiceDate: date("invoice_date"),
  dueDate: date("due_date"),
  customerPo: text("customer_po"), // For project matching
  jobName: text("job_name"), // For project matching
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }),
  tax: numeric("tax", { precision: 12, scale: 2 }),
  shipping: numeric("shipping", { precision: 12, scale: 2 }),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  // Confidence & extraction metadata
  totalConfidence: numeric("total_confidence", { precision: 5, scale: 2 }),
  vendorConfidence: numeric("vendor_confidence", { precision: 5, scale: 2 }),
  extractionMethod: text("extraction_method").default("deterministic"), // deterministic | llm_fallback
  // Status & reconciliation
  status: text("status").notNull().default("parsed_ok"), // parsed_ok | needs_review | approved | rejected
  reconciliationDelta: numeric("reconciliation_delta", { precision: 10, scale: 2 }), // |subtotal + tax - total|
  // Source tracking
  sourceJobId: varchar("source_job_id").references(() => ingestionJobs.id, { onDelete: "set null" }),
  sourceRef: text("source_ref"), // e.g., s3://bucket/key
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  vendorRef: one(vendors, { fields: [invoices.vendorId], references: [vendors.id] }),
  sourceJob: one(ingestionJobs, { fields: [invoices.sourceJobId], references: [ingestionJobs.id] }),
  lineItems: many(invoiceLineItems),
}));

// ========== INVOICE LINE ITEMS TABLE ==========
export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  productCode: text("product_code"),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 4 }),
  unit: text("unit"), // EA, FT, BOX, etc.
  unitPrice: numeric("unit_price", { precision: 12, scale: 4 }),
  lineAmount: numeric("line_amount", { precision: 12, scale: 2 }),
  // Categorization
  category: text("category"), // drywall, framing, concrete, paint, electrical, plumbing, hvac, tools, misc
  categoryConfidence: numeric("category_confidence", { precision: 5, scale: 2 }),
  categoryReason: text("category_reason"), // keyword matched, LLM, manual
  // Raw extraction data
  rawLine: text("raw_line"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLineItems.invoiceId], references: [invoices.id] }),
  company: one(companies, { fields: [invoiceLineItems.companyId], references: [companies.id] }),
}));

export const weeklyReports = pgTable("weekly_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(),
  summary: jsonb("summary").notNull(),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const weeklyReportsRelations = relations(weeklyReports, ({ one }) => ({
  company: one(companies, { fields: [weeklyReports.companyId], references: [companies.id] }),
}));

export const importFiles = pgTable("import_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  filename: text("filename"),
  source: text("source").notNull().default("csv"),
  status: text("status").notNull().default("pending"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const importFilesRelations = relations(importFiles, ({ one, many }) => ({
  company: one(companies, { fields: [importFiles.companyId], references: [companies.id] }),
  rows: many(importRows),
}));

export const importRows = pgTable("import_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importFileId: varchar("import_file_id").notNull().references(() => importFiles.id, { onDelete: "cascade" }),
  rawData: jsonb("raw_data"),
  mapped: boolean("mapped").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const importRowsRelations = relations(importRows, ({ one }) => ({
  importFile: one(importFiles, { fields: [importRows.importFileId], references: [importFiles.id] }),
}));

export const companySettings = pgTable("company_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  reportDay: text("report_day").notNull().default("monday"),
  reportTime: text("report_time").notNull().default("08:00"),
  reportTimezone: text("report_timezone").notNull().default("America/New_York"),
  marginThreshold: numeric("margin_threshold", { precision: 5, scale: 2 }).notNull().default("25"),
  costSpikeThreshold: numeric("cost_spike_threshold", { precision: 5, scale: 2 }).notNull().default("10"),
  largeTxnThreshold: numeric("large_txn_threshold", { precision: 12, scale: 2 }).notNull().default("20000"),
  laborShareThreshold: numeric("labor_share_threshold", { precision: 5, scale: 2 }).notNull().default("50"),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  smsNotifications: boolean("sms_notifications").notNull().default(false),
  whatsappNotifications: boolean("whatsapp_notifications").notNull().default(false),
  emailList: text("email_list").array().default(sql`'{}'::text[]`),
  phoneList: text("phone_list").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const companySettingsRelations = relations(companySettings, ({ one }) => ({
  company: one(companies, { fields: [companySettings.companyId], references: [companies.id] }),
}));

export const qbConnections = pgTable("qb_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }).unique(),
  realmId: text("realm_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),  
  tokenExpiresAt: timestamp("token_expires_at"),
  connectionStatus: text("connection_status").notNull().default("disconnected"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const qbConnectionsRelations = relations(qbConnections, ({ one }) => ({
  company: one(companies, { fields: [qbConnections.companyId], references: [companies.id] }),
}));


export const ingestionJobsRelations = relations(ingestionJobs, ({ one, many }) => ({
  company: one(companies, { fields: [ingestionJobs.companyId], references: [companies.id] }),
  results: many(ingestionResults),
}));

export const ingestionResults = pgTable("ingestion_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  ingestionJobId: varchar("ingestion_job_id")
    .notNull()
    .references(() => ingestionJobs.id, { onDelete: "cascade" }),

  rawText: text("raw_text"),
  extractedJson: jsonb("extracted_json"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
});


export const ingestionResultsRelations = relations(ingestionResults, ({ one }) => ({
  ingestionJob: one(ingestionJobs, { fields: [ingestionResults.ingestionJobId], references: [ingestionJobs.id] }),
}));

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true, trialEndsAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, lastLoginAt: true });
export const insertUserCompanySchema = createInsertSchema(userCompanies).omit({ id: true, invitedAt: true, acceptedAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertLaborEntrySchema = createInsertSchema(laborEntries).omit({ id: true, createdAt: true });
export const insertWeeklyReportSchema = createInsertSchema(weeklyReports).omit({ id: true, createdAt: true });
export const insertImportFileSchema = createInsertSchema(importFiles).omit({ id: true, uploadedAt: true });
export const insertImportRowSchema = createInsertSchema(importRows).omit({ id: true, createdAt: true });
export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQbConnectionSchema = createInsertSchema(qbConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertIngestionJobSchema = createInsertSchema(ingestionJobs).omit({ id: true, createdAt: true, processedAt: true });
export const insertIngestionResultSchema = createInsertSchema(ingestionResults).omit({ id: true, createdAt: true, approvedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({ id: true, createdAt: true });
export const insertGeneralContractorSchema = createInsertSchema(generalContractors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChangeOrderSchema = createInsertSchema(changeOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectInvoiceSchema = createInsertSchema(projectInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentReceivedSchema = createInsertSchema(paymentsReceived).omit({ id: true, createdAt: true });
export const insertWorkerSchema = createInsertSchema(workers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({ id: true, createdAt: true });
export const insertEstimateSchema = createInsertSchema(estimates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEstimateLineItemSchema = createInsertSchema(estimateLineItems).omit({ id: true, createdAt: true });

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertUserCompany = z.infer<typeof insertUserCompanySchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type InsertLaborEntry = z.infer<typeof insertLaborEntrySchema>;
export type InsertWeeklyReport = z.infer<typeof insertWeeklyReportSchema>;
export type InsertImportFile = z.infer<typeof insertImportFileSchema>;
export type InsertImportRow = z.infer<typeof insertImportRowSchema>;
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type InsertQbConnection = z.infer<typeof insertQbConnectionSchema>;
export type InsertIngestionJob = z.infer<typeof insertIngestionJobSchema>;
export type InsertIngestionResult = z.infer<typeof insertIngestionResultSchema>;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type InsertGeneralContractor = z.infer<typeof insertGeneralContractorSchema>;
export type InsertChangeOrder = z.infer<typeof insertChangeOrderSchema>;
export type InsertProjectInvoice = z.infer<typeof insertProjectInvoiceSchema>;
export type InsertPaymentReceived = z.infer<typeof insertPaymentReceivedSchema>;
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type InsertEstimateLineItem = z.infer<typeof insertEstimateLineItemSchema>;

export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
export type UserCompany = typeof userCompanies.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type LaborEntry = typeof laborEntries.$inferSelect;
export type WeeklyReport = typeof weeklyReports.$inferSelect;
export type ImportFile = typeof importFiles.$inferSelect;
export type ImportRow = typeof importRows.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type QbConnection = typeof qbConnections.$inferSelect;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type IngestionResult = typeof ingestionResults.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type GeneralContractor = typeof generalContractors.$inferSelect;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type ProjectInvoice = typeof projectInvoices.$inferSelect;
export type PaymentReceived = typeof paymentsReceived.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type PayrollEntry = typeof payrollEntries.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type EstimateLineItem = typeof estimateLineItems.$inferSelect;

export type ReportSummary = {
  totalCost: number;
  totalRevenue: number;
  grossMargin: number;
  alerts: string[];
  projects: Record<string, { cost: number; revenue: number; margin: number }>;
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  otherCost: number;
};

// ========== PROJECT BUDGETS (TAKEOFFS) ==========
// The original material estimate/bid for a project
export const projectBudgets = pgTable("project_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Original Estimate"), // e.g., "Original Takeoff", "Change Order 1"
  contractValue: numeric("contract_value", { precision: 14, scale: 2 }).notNull(), // Total contract amount
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 2 }), // Total estimated costs
  estimatedProfit: numeric("estimated_profit", { precision: 14, scale: 2 }), // Expected profit
  estimatedMargin: numeric("estimated_margin", { precision: 5, scale: 2 }), // Expected margin %
  status: text("status").notNull().default("active"), // draft, active, revised, closed
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectBudgetsRelations = relations(projectBudgets, ({ one, many }) => ({
  project: one(projects, { fields: [projectBudgets.projectId], references: [projects.id] }),
  company: one(companies, { fields: [projectBudgets.companyId], references: [companies.id] }),
  lineItems: many(budgetLineItems),
}));

// ========== BUDGET LINE ITEMS ==========
// Individual items in the takeoff/estimate
export const budgetLineItems = pgTable("budget_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  budgetId: varchar("budget_id").notNull().references(() => projectBudgets.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // metal_studs, ceiling_grid, etc.
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 4 }),
  unit: text("unit"), // EA, LF, SF, BOX, etc.
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
  // Tracking actual vs budget
  quantityUsed: numeric("quantity_used", { precision: 12, scale: 4 }).default("0"),
  costToDate: numeric("cost_to_date", { precision: 12, scale: 2 }).default("0"),
  variance: numeric("variance", { precision: 12, scale: 2 }), // totalCost - costToDate (negative = over budget)
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const budgetLineItemsRelations = relations(budgetLineItems, ({ one }) => ({
  budget: one(projectBudgets, { fields: [budgetLineItems.budgetId], references: [projectBudgets.id] }),
  company: one(companies, { fields: [budgetLineItems.companyId], references: [companies.id] }),
}));

// ========== PAYMENT PHASES ==========
// Define payment milestones for a project (25% start, 50% rough-in, etc.)
export const paymentPhases = pgTable("payment_phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Mobilization", "Rough-in Complete", "Finish", "Final"
  percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(), // 25.00, 50.00, etc.
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // Calculated from contract value
  sequenceOrder: numeric("sequence_order").notNull().default("1"), // Order of phases
  description: text("description"), // What needs to be completed for this phase
  // Status tracking
  status: text("status").notNull().default("pending"), // pending, invoiced, partial, paid
  dueDate: date("due_date"), // Expected payment date
  invoicedDate: date("invoiced_date"), // When we submitted invoice to GC
  invoiceNumber: text("invoice_number"), // Our invoice number for this phase
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paymentPhasesRelations = relations(paymentPhases, ({ one, many }) => ({
  project: one(projects, { fields: [paymentPhases.projectId], references: [projects.id] }),
  company: one(companies, { fields: [paymentPhases.companyId], references: [companies.id] }),
  payments: many(paymentRecords),
}));

// ========== PAYMENT RECORDS ==========
// Actual payments received for each phase
export const paymentRecords = pgTable("payment_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phaseId: varchar("phase_id").notNull().references(() => paymentPhases.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: text("payment_method"), // check, wire, ach, etc.
  referenceNumber: text("reference_number"), // Check number, transaction ID
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentRecordsRelations = relations(paymentRecords, ({ one }) => ({
  phase: one(paymentPhases, { fields: [paymentRecords.phaseId], references: [paymentPhases.id] }),
  project: one(projects, { fields: [paymentRecords.projectId], references: [projects.id] }),
  company: one(companies, { fields: [paymentRecords.companyId], references: [companies.id] }),
}));

// ========== INSERT SCHEMAS ==========
export const insertProjectBudgetSchema = createInsertSchema(projectBudgets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBudgetLineItemSchema = createInsertSchema(budgetLineItems).omit({ id: true, createdAt: true });
export const insertPaymentPhaseSchema = createInsertSchema(paymentPhases).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentRecordSchema = createInsertSchema(paymentRecords).omit({ id: true, createdAt: true });

export type InsertProjectBudget = z.infer<typeof insertProjectBudgetSchema>;
export type InsertBudgetLineItem = z.infer<typeof insertBudgetLineItemSchema>;
export type InsertPaymentPhase = z.infer<typeof insertPaymentPhaseSchema>;
export type InsertPaymentRecord = z.infer<typeof insertPaymentRecordSchema>;

export type ProjectBudget = typeof projectBudgets.$inferSelect;
export type BudgetLineItem = typeof budgetLineItems.$inferSelect;
export type PaymentPhase = typeof paymentPhases.$inferSelect;
export type PaymentRecord = typeof paymentRecords.$inferSelect;

// ========== PROJECT FINANCIAL SUMMARY (Computed Type) ==========
export type ProjectFinancials = {
  projectId: string;
  projectName: string;
  // Contract & Budget
  contractValue: number;
  estimatedCost: number;
  estimatedProfit: number;
  estimatedMargin: number;
  // Actual Performance
  costsToDate: number;
  revenueToDate: number; // Payments received
  profitToDate: number;
  actualMargin: number;
  // Budget Tracking
  budgetRemaining: number;
  budgetVariance: number; // Positive = under budget, Negative = over budget
  percentComplete: number; // Based on costs
  // Payment Status
  totalInvoiced: number;
  totalPaid: number;
  outstandingReceivables: number;
  // Alerts
  isOverBudget: boolean;
  isUnderperforming: boolean;
  alerts: string[];
};

// ========== DAILY LOGS (Job Site Documentation) ==========
export const dailyLogs = pgTable("daily_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  logDate: date("log_date").notNull(),
  // Weather conditions
  weather: text("weather"), // sunny, cloudy, rainy, snowy, etc.
  temperatureHigh: numeric("temperature_high", { precision: 5, scale: 1 }),
  temperatureLow: numeric("temperature_low", { precision: 5, scale: 1 }),
  // Work details
  workersOnSite: numeric("workers_on_site"),
  workPerformed: text("work_performed"), // Description of work done
  materialsDelivered: text("materials_delivered"), // What materials arrived
  equipmentUsed: text("equipment_used"), // Equipment on site
  // Issues and notes
  delays: text("delays"), // Any delays or issues
  safetyIncidents: text("safety_incidents"), // Safety issues
  visitorLog: text("visitor_log"), // Inspectors, GC visits, etc.
  notes: text("notes"), // General notes
  // Photos stored as JSON array of S3 URLs
  photos: jsonb("photos").$type<string[]>().default([]),
  // Metadata
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dailyLogsRelations = relations(dailyLogs, ({ one }) => ({
  company: one(companies, { fields: [dailyLogs.companyId], references: [companies.id] }),
  project: one(projects, { fields: [dailyLogs.projectId], references: [projects.id] }),
  creator: one(users, { fields: [dailyLogs.createdBy], references: [users.id] }),
}));

export const insertDailyLogSchema = createInsertSchema(dailyLogs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type DailyLog = typeof dailyLogs.$inferSelect;

// ========== NOTIFICATIONS ==========
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: varchar("company_id").references(() => companies.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // payment_received, invoice_due, invoice_overdue, estimate_viewed, estimate_accepted, daily_log_reminder
  title: text("title").notNull(),
  message: text("message").notNull(),
  // Link to related entity
  relatedType: text("related_type"), // invoice, estimate, payment, project, daily_log
  relatedId: varchar("related_id"),
  // Status
  read: boolean("read").notNull().default(false),
  readAt: timestamp("read_at"),
  // Email/SMS tracking
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  smsSent: boolean("sms_sent").default(false),
  smsSentAt: timestamp("sms_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  company: one(companies, { fields: [notifications.companyId], references: [companies.id] }),
}));

// ========== NOTIFICATION PREFERENCES ==========
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  // Email preferences
  emailPaymentReceived: boolean("email_payment_received").default(true),
  emailInvoiceDue: boolean("email_invoice_due").default(true),
  emailInvoiceOverdue: boolean("email_invoice_overdue").default(true),
  emailEstimateViewed: boolean("email_estimate_viewed").default(true),
  emailDailyLogReminder: boolean("email_daily_log_reminder").default(false),
  emailWeeklySummary: boolean("email_weekly_summary").default(true),
  // SMS preferences
  smsEnabled: boolean("sms_enabled").default(false),
  smsPhoneNumber: text("sms_phone_number"),
  smsPaymentReceived: boolean("sms_payment_received").default(false),
  smsInvoiceOverdue: boolean("sms_invoice_overdue").default(false),
  // Quiet hours (don't send notifications during these times)
  quietHoursStart: text("quiet_hours_start"), // "22:00"
  quietHoursEnd: text("quiet_hours_end"), // "08:00"
  timezone: text("timezone").default("America/New_York"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, { fields: [notificationPreferences.userId], references: [users.id] }),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({ id: true, updatedAt: true });

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
