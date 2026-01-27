import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, numeric, date, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  timezone: text("timezone").notNull().default("America/New_York"),
  ingestionEmailAlias: text("ingestion_email_alias"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ingestionJobs = pgTable("ingestion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id"),
  status: text("status").notNull(),        // "pending" | "processed" | ...
  filename: text("filename").notNull(),
  fileUrl: text("file_url").notNull(),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const companiesRelations = relations(companies, ({ many, one }) => ({
  projects: many(projects),
  transactions: many(transactions),
  vendors: many(vendors),
  laborEntries: many(laborEntries),
  weeklyReports: many(weeklyReports),
  importFiles: many(importFiles),
  ingestionJobs: many(ingestionJobs),
  settings: one(companySettings),
  qbConnection: one(qbConnections),
}));

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, { fields: [projects.companyId], references: [companies.id] }),
  transactions: many(transactions),
  laborEntries: many(laborEntries),
}));

export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  company: one(companies, { fields: [vendors.companyId], references: [companies.id] }),
  transactions: many(transactions),
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
  ingestionJobId: varchar("ingestion_job_id").notNull().references(() => ingestionJobs.id, { onDelete: "cascade" }),
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

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true });
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

export type InsertCompany = z.infer<typeof insertCompanySchema>;
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

export type Company = typeof companies.$inferSelect;
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
