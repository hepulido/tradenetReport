import { eq, and, gte, lte, desc, sql, sum } from "drizzle-orm";
import { db } from "./db";
import {
  companies, projects, vendors, transactions, laborEntries,
  weeklyReports, importFiles, importRows, companySettings, qbConnections,
  ingestionJobs, ingestionResults, invoices, invoiceLineItems,
  projectBudgets, budgetLineItems, paymentPhases, paymentRecords,
  generalContractors, changeOrders, projectInvoices, paymentsReceived,
  workers, payrollEntries, users, userCompanies, estimates, estimateLineItems,
  dailyLogs, notifications, notificationPreferences,
  type Company, type Project, type Vendor, type Transaction,
  type LaborEntry, type WeeklyReport, type ImportFile, type ImportRow,
  type CompanySettings, type QbConnection, type IngestionJob, type IngestionResult,
  type Invoice, type InvoiceLineItem,
  type ProjectBudget, type BudgetLineItem, type PaymentPhase, type PaymentRecord,
  type GeneralContractor, type ChangeOrder, type ProjectInvoice, type PaymentReceived,
  type Worker, type PayrollEntry, type User, type UserCompany, type Estimate, type EstimateLineItem,
  type DailyLog, type Notification, type NotificationPreferences,
  type ProjectFinancials,
  type InsertCompany, type InsertProject, type InsertVendor, type InsertTransaction,
  type InsertLaborEntry, type InsertWeeklyReport, type InsertImportFile, type InsertImportRow,
  type InsertCompanySettings, type InsertQbConnection, type InsertIngestionJob, type InsertIngestionResult,
  type InsertInvoice, type InsertInvoiceLineItem,
  type InsertProjectBudget, type InsertBudgetLineItem, type InsertPaymentPhase, type InsertPaymentRecord,
  type InsertGeneralContractor, type InsertChangeOrder, type InsertProjectInvoice, type InsertPaymentReceived,
  type InsertWorker, type InsertPayrollEntry, type InsertUser, type InsertUserCompany,
  type InsertEstimate, type InsertEstimateLineItem,
  type InsertDailyLog, type InsertNotification, type InsertNotificationPreferences,
  type ReportSummary
} from "@shared/schema";

export interface IStorage {
  // ========== USERS ==========
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  getOrCreateUser(data: InsertUser): Promise<User>;
  updateUserLastLogin(id: string): Promise<void>;

  // ========== USER-COMPANIES ==========
  getUserCompanies(userId: string): Promise<Array<UserCompany & { company: Company }>>;
  getCompanyUsers(companyId: string): Promise<Array<UserCompany & { user: User }>>;
  getUserByEmail(email: string): Promise<User | undefined>;
  addUserToCompany(data: InsertUserCompany): Promise<UserCompany>;
  removeUserFromCompany(userCompanyId: string): Promise<void>;
  updateUserCompanyRole(userCompanyId: string, role: string): Promise<UserCompany>;
  updateCompanySubscription(companyId: string, data: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionStatus?: string; subscriptionPlan?: string; trialEndsAt?: Date }): Promise<Company>;

  // ========== COMPANIES ==========
  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(data: InsertCompany): Promise<Company>;

  getProjects(companyId: string): Promise<Project[]>;
  getProject(id: string): Promise<(Project & { gc?: GeneralContractor }) | undefined>;
  createProject(data: InsertProject): Promise<Project>;

  getVendors(companyId: string): Promise<Vendor[]>;
  createVendor(data: InsertVendor): Promise<Vendor>;

  getTransactions(companyId: string, filters?: { projectId?: string; startDate?: string; endDate?: string }): Promise<Transaction[]>;
  getProjectTransactions(projectId: string): Promise<Transaction[]>;
  createTransaction(data: InsertTransaction): Promise<Transaction>;
  createTransactions(data: InsertTransaction[]): Promise<Transaction[]>;

  getLaborEntries(companyId: string, filters?: { projectId?: string; startDate?: string; endDate?: string }): Promise<LaborEntry[]>;
  createLaborEntry(data: InsertLaborEntry): Promise<LaborEntry>;
  createLaborEntries(data: InsertLaborEntry[]): Promise<LaborEntry[]>;

  getWeeklyReports(companyId: string): Promise<WeeklyReport[]>;
  getWeeklyReport(id: string): Promise<WeeklyReport | undefined>;
  getWeeklyReportByWeek(companyId: string, weekStart: string): Promise<WeeklyReport | undefined>;
  createWeeklyReport(data: InsertWeeklyReport): Promise<WeeklyReport>;

  getImportFiles(companyId: string): Promise<ImportFile[]>;
  createImportFile(data: InsertImportFile): Promise<ImportFile>;
  updateImportFileStatus(id: string, status: string): Promise<void>;
  createImportRows(data: InsertImportRow[]): Promise<ImportRow[]>;

  getProjectSummary(projectId: string): Promise<{ totalCost: number; totalRevenue: number; margin: number; transactionCount: number }>;

  getCompanySettings(companyId: string): Promise<CompanySettings | undefined>;
  upsertCompanySettings(companyId: string, data: Partial<InsertCompanySettings>): Promise<CompanySettings>;

  getQbConnection(companyId: string): Promise<QbConnection | undefined>;
  upsertQbConnection(companyId: string, data: Partial<InsertQbConnection>): Promise<QbConnection>;
  deleteQbConnection(companyId: string): Promise<void>;

  getIngestionJobs(companyId: string): Promise<IngestionJob[]>;
  getIngestionJob(id: string): Promise<IngestionJob | undefined>;
  createIngestionJob(data: InsertIngestionJob): Promise<IngestionJob>;
  updateIngestionJobStatus(id: string, status: string, errorMessage?: string): Promise<void>;
  updateIngestionJobExtractedText(id: string, extractedText: string): Promise<void>;
  updateIngestionJobFileUrl(id: string, fileUrl: string): Promise<void>;

  getIngestionResults(jobId: string): Promise<IngestionResult[]>;
  getIngestionResult(id: string): Promise<IngestionResult | undefined>;
  createIngestionResult(data: InsertIngestionResult): Promise<IngestionResult>;
  approveIngestionResult(id: string): Promise<IngestionResult>;
  updateIngestionJobFinalResults(
    id: string,
    data: { finalCategorizedResultId?: string | null; finalParsedResultId?: string | null }
  ): Promise<void>;
  deleteTransactionsBySourceRef(data: {
    companyId: string;
    source: string;
    sourceRef: string;
  }): Promise<number>;

  // Vendor methods (normalized)
  findVendorByNormalizedName(companyId: string, normalizedName: string): Promise<Vendor | undefined>;
  findOrCreateVendor(companyId: string, vendorName: string): Promise<Vendor>;

  // Review queue methods
  updateIngestionJobReviewFields(
    id: string,
    data: {
      needsReview?: boolean;
      reviewReason?: string | null;
      reviewStatus?: string;
      reviewedAt?: Date | null;
      overrideTotal?: string | null;
      overrideVendorName?: string | null;
    }
  ): Promise<void>;
  listIngestionJobsNeedingReview(companyId: string, status?: string, limit?: number): Promise<IngestionJob[]>;

  // Sync inbound emails
  findIngestionJobByFileUrl(fileUrl: string): Promise<IngestionJob | undefined>;

  // Dedupe protection
  findDuplicateTransaction(params: {
    companyId: string;
    vendorId: string | null;
    amount: string;
    txnDate: string;
    lookbackDays?: number;
  }): Promise<Transaction | undefined>;

  getCompanyDashboard(companyId: string, weekStart: string, weekEnd: string): Promise<{
    totalCost: number;
    totalRevenue: number;
    grossMargin: number;
    laborCost: number;
    materialCost: number;
    equipmentCost: number;
    alerts: string[];
    projects: { id: string; name: string; cost: number; revenue: number; margin: number; status: string }[];
    insights: {
      costChangePercent: number;
      laborCostPercent: number;
      materialCostPercent: number;
      equipmentCostPercent: number;
      lowMarginProjects: { name: string; margin: number }[];
      largeTransactions: { description: string; amount: number; vendor: string | null }[];
      previousWeekCost: number;
    };
  }>;

  // ========== INVOICES & LINE ITEMS ==========
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoicesByCompany(companyId: string, filters?: { projectId?: string; vendorId?: string; startDate?: string; endDate?: string; status?: string }): Promise<Invoice[]>;
  getInvoiceBySourceJob(sourceJobId: string): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<void>;

  // Dedupe support (uses normalized invoice number)
  findInvoiceByDedupeKey(companyId: string, invoiceNumberNorm: string, invoiceDate: string | null, total: string): Promise<Invoice | undefined>;
  deleteInvoiceLineItems(invoiceId: string): Promise<number>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice>;

  createInvoiceLineItems(data: InsertInvoiceLineItem[]): Promise<InvoiceLineItem[]>;
  getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]>;
  getLineItemsByProject(projectId: string, filters?: { category?: string; vendor?: string }): Promise<InvoiceLineItem[]>;
  getLineItemsByCompany(companyId: string, filters?: { category?: string; vendorId?: string; q?: string }): Promise<InvoiceLineItem[]>;

  // Project summary for reports
  getProjectMaterialsSummary(projectId: string): Promise<{
    totalMaterials: number;
    totalLabor: number;
    spendByCategory: Record<string, number>;
    topVendors: { vendor: string; total: number }[];
    invoiceCount: number;
    lineItemCount: number;
  }>;

  // Project matching heuristics
  findProjectByExternalRef(companyId: string, externalRef: string): Promise<Project | undefined>;
  updateProject(id: string, data: Partial<{ name: string; externalRef: string; status: string }>): Promise<Project>;

  // ========== PROJECT BUDGETS (TAKEOFFS) ==========
  createProjectBudget(data: InsertProjectBudget): Promise<ProjectBudget>;
  getProjectBudget(id: string): Promise<ProjectBudget | undefined>;
  getProjectBudgets(projectId: string): Promise<ProjectBudget[]>;
  updateProjectBudget(id: string, data: Partial<InsertProjectBudget>): Promise<ProjectBudget>;
  deleteProjectBudget(id: string): Promise<void>;

  // Budget Line Items
  createBudgetLineItems(data: InsertBudgetLineItem[]): Promise<BudgetLineItem[]>;
  getBudgetLineItems(budgetId: string): Promise<BudgetLineItem[]>;
  updateBudgetLineItem(id: string, data: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem>;
  deleteBudgetLineItem(id: string): Promise<void>;

  // ========== PAYMENT PHASES ==========
  createPaymentPhase(data: InsertPaymentPhase): Promise<PaymentPhase>;
  getPaymentPhases(projectId: string): Promise<PaymentPhase[]>;
  getPaymentPhase(id: string): Promise<PaymentPhase | undefined>;
  updatePaymentPhase(id: string, data: Partial<InsertPaymentPhase>): Promise<PaymentPhase>;
  deletePaymentPhase(id: string): Promise<void>;

  // Payment Records
  createPaymentRecord(data: InsertPaymentRecord): Promise<PaymentRecord>;
  getPaymentRecords(phaseId: string): Promise<PaymentRecord[]>;
  getProjectPaymentRecords(projectId: string): Promise<PaymentRecord[]>;
  deletePaymentRecord(id: string): Promise<void>;

  // ========== PROJECT FINANCIALS (COMPUTED) ==========
  getProjectFinancials(projectId: string): Promise<ProjectFinancials>;
  getCompanyProjectsFinancials(companyId: string): Promise<ProjectFinancials[]>;

  // ========== GENERAL CONTRACTORS ==========
  createGeneralContractor(data: InsertGeneralContractor): Promise<GeneralContractor>;
  getGeneralContractors(companyId: string): Promise<GeneralContractor[]>;
  getGeneralContractor(id: string): Promise<GeneralContractor | undefined>;
  updateGeneralContractor(id: string, data: Partial<InsertGeneralContractor>): Promise<GeneralContractor>;
  deleteGeneralContractor(id: string): Promise<void>;

  // ========== CHANGE ORDERS ==========
  createChangeOrder(data: InsertChangeOrder): Promise<ChangeOrder>;
  getChangeOrders(projectId: string): Promise<ChangeOrder[]>;
  getChangeOrder(id: string): Promise<ChangeOrder | undefined>;
  updateChangeOrder(id: string, data: Partial<InsertChangeOrder>): Promise<ChangeOrder>;
  deleteChangeOrder(id: string): Promise<void>;
  getChangeOrdersByGc(gcId: string): Promise<ChangeOrder[]>;

  // ========== PROJECT INVOICES (Invoices TO GC) ==========
  createProjectInvoice(data: InsertProjectInvoice): Promise<ProjectInvoice>;
  getProjectInvoices(projectId: string): Promise<ProjectInvoice[]>;
  getProjectInvoice(id: string): Promise<ProjectInvoice | undefined>;
  updateProjectInvoice(id: string, data: Partial<InsertProjectInvoice>): Promise<ProjectInvoice>;
  deleteProjectInvoice(id: string): Promise<void>;
  getProjectInvoicesByGc(gcId: string): Promise<ProjectInvoice[]>;

  // ========== PAYMENTS RECEIVED (From GC) ==========
  createPaymentReceived(data: InsertPaymentReceived): Promise<PaymentReceived>;
  getPaymentsReceived(projectId: string): Promise<PaymentReceived[]>;
  getPaymentReceived(id: string): Promise<PaymentReceived | undefined>;
  deletePaymentReceived(id: string): Promise<void>;
  getPaymentsReceivedByInvoice(projectInvoiceId: string): Promise<PaymentReceived[]>;

  // ========== ESTIMATES/PROPOSALS ==========
  createEstimate(data: InsertEstimate): Promise<Estimate>;
  getEstimates(companyId: string): Promise<Estimate[]>;
  getEstimate(id: string): Promise<Estimate | undefined>;
  updateEstimate(id: string, data: Partial<InsertEstimate>): Promise<Estimate>;
  deleteEstimate(id: string): Promise<void>;
  createEstimateLineItem(data: InsertEstimateLineItem): Promise<EstimateLineItem>;
  getEstimateLineItems(estimateId: string): Promise<EstimateLineItem[]>;
  updateEstimateLineItem(id: string, data: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem>;
  deleteEstimateLineItem(id: string): Promise<void>;
  convertEstimateToProject(estimateId: string): Promise<Project>;

  // ========== WORKERS ==========
  createWorker(data: InsertWorker): Promise<Worker>;
  getWorkers(companyId: string): Promise<Worker[]>;
  getWorker(id: string): Promise<Worker | undefined>;
  updateWorker(id: string, data: Partial<InsertWorker>): Promise<Worker>;
  deleteWorker(id: string): Promise<void>;
  findWorkerByName(companyId: string, name: string): Promise<Worker | undefined>;

  // ========== PAYROLL ENTRIES ==========
  createPayrollEntry(data: InsertPayrollEntry): Promise<PayrollEntry>;
  createPayrollEntries(data: InsertPayrollEntry[]): Promise<PayrollEntry[]>;
  getPayrollEntries(companyId: string, filters?: { projectId?: string; workerId?: string; weekStart?: string; weekEnd?: string }): Promise<PayrollEntry[]>;
  getPayrollEntriesByProject(projectId: string): Promise<PayrollEntry[]>;
  getPayrollEntriesByWorker(workerId: string): Promise<PayrollEntry[]>;
  getPayrollEntriesByWeek(companyId: string, weekStart: string): Promise<PayrollEntry[]>;
  getPayrollEntry(id: string): Promise<PayrollEntry | undefined>;
  updatePayrollEntry(id: string, data: Partial<InsertPayrollEntry>): Promise<PayrollEntry>;
  deletePayrollEntry(id: string): Promise<void>;
  deletePayrollEntriesByWeek(companyId: string, weekStart: string): Promise<number>;
  // Summary methods
  getProjectLaborCost(projectId: string): Promise<number>;
  getProjectLaborCostByWeek(projectId: string, weekStart: string, weekEnd: string): Promise<number>;

  // Portfolio summary (aggregated across all projects)
  getCompanyPortfolioSummary(companyId: string): Promise<{
    // Contract totals
    totalInitialContract: number;
    totalApprovedCOs: number;
    totalContractValue: number;
    // Billing & Collection
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRate: number;
    // Project counts
    activeProjectCount: number;
    totalProjectCount: number;
    // Pending items
    pendingCOCount: number;
    pendingCOValue: number;
    // Recent activity
    recentInvoices: Array<{
      id: string;
      invoiceNumber: string;
      amount: string;
      invoiceDate: string;
      projectName: string;
      projectId: string;
      status: string;
    }>;
    recentPayments: Array<{
      id: string;
      amount: string;
      paymentDate: string;
      paymentMethod: string | null;
      referenceNumber: string | null;
      projectName: string;
      projectId: string;
    }>;
    // Projects needing attention
    projectsNeedingAttention: Array<{
      id: string;
      name: string;
      reason: string;
      value?: number;
    }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // ========== HEALTH CHECK ==========
  async healthCheck(): Promise<boolean> {
    try {
      await db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  // ========== USERS ==========
  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    return result[0];
  }

  async createUser(data: InsertUser): Promise<User> {
    // Use ON CONFLICT to handle duplicates gracefully
    const result = await db
      .insert(users)
      .values(data)
      .onConflictDoUpdate({
        target: users.firebaseUid,
        set: { lastLoginAt: new Date() }, // Just update last login if exists
      })
      .returning();
    return result[0];
  }

  async getOrCreateUser(data: InsertUser): Promise<User> {
    // First try to find existing user
    const existing = await this.getUserByFirebaseUid(data.firebaseUid);
    if (existing) {
      await this.updateUserLastLogin(existing.id);
      return existing;
    }
    // Create new user (with conflict handling just in case)
    return this.createUser(data);
  }

  async updateUserLastLogin(id: string): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  }

  // ========== USER-COMPANIES ==========
  async getUserCompanies(userId: string): Promise<Array<UserCompany & { company: Company }>> {
    const result = await db
      .select({
        id: userCompanies.id,
        userId: userCompanies.userId,
        companyId: userCompanies.companyId,
        role: userCompanies.role,
        invitedAt: userCompanies.invitedAt,
        acceptedAt: userCompanies.acceptedAt,
        company: companies,
      })
      .from(userCompanies)
      .innerJoin(companies, eq(userCompanies.companyId, companies.id))
      .where(eq(userCompanies.userId, userId));

    return result as Array<UserCompany & { company: Company }>;
  }

  async getCompanyUsers(companyId: string): Promise<Array<UserCompany & { user: User }>> {
    const result = await db
      .select({
        id: userCompanies.id,
        userId: userCompanies.userId,
        companyId: userCompanies.companyId,
        role: userCompanies.role,
        invitedAt: userCompanies.invitedAt,
        acceptedAt: userCompanies.acceptedAt,
        user: users,
      })
      .from(userCompanies)
      .innerJoin(users, eq(userCompanies.userId, users.id))
      .where(eq(userCompanies.companyId, companyId));

    return result as Array<UserCompany & { user: User }>;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async addUserToCompany(data: InsertUserCompany): Promise<UserCompany> {
    const result = await db.insert(userCompanies).values({
      ...data,
      acceptedAt: new Date(),
    }).returning();
    return result[0];
  }

  async removeUserFromCompany(userCompanyId: string): Promise<void> {
    await db.delete(userCompanies).where(eq(userCompanies.id, userCompanyId));
  }

  async updateUserCompanyRole(userCompanyId: string, role: string): Promise<UserCompany> {
    const result = await db.update(userCompanies)
      .set({ role })
      .where(eq(userCompanies.id, userCompanyId))
      .returning();
    return result[0];
  }

  async updateCompanySubscription(
    companyId: string,
    data: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionStatus?: string; subscriptionPlan?: string; trialEndsAt?: Date }
  ): Promise<Company> {
    const result = await db.update(companies).set(data).where(eq(companies.id, companyId)).returning();
    return result[0];
  }

  // ========== COMPANIES ==========
  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id));
    return result[0];
  }

  async createCompany(data: InsertCompany): Promise<Company> {
    const result = await db.insert(companies).values(data).returning();
    return result[0];
  }

  async getProjects(companyId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.companyId, companyId)).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<(Project & { gc?: GeneralContractor }) | undefined> {
    const result = await db
      .select({
        project: projects,
        gc: generalContractors,
      })
      .from(projects)
      .leftJoin(generalContractors, eq(projects.gcId, generalContractors.id))
      .where(eq(projects.id, id));

    if (!result[0]) return undefined;

    return {
      ...result[0].project,
      gc: result[0].gc || undefined,
    };
  }

  async createProject(data: InsertProject): Promise<Project> {
    const result = await db.insert(projects).values(data).returning();
    return result[0];
  }

  async getVendors(companyId: string): Promise<Vendor[]> {
    return db.select().from(vendors).where(eq(vendors.companyId, companyId)).orderBy(vendors.name);
  }

  async createVendor(data: InsertVendor): Promise<Vendor> {
    const result = await db.insert(vendors).values(data).returning();
    return result[0];
  }

  async getTransactions(companyId: string, filters?: { projectId?: string; startDate?: string; endDate?: string }): Promise<Transaction[]> {
    let conditions = [eq(transactions.companyId, companyId)];
    if (filters?.projectId) conditions.push(eq(transactions.projectId, filters.projectId));
    if (filters?.startDate) conditions.push(gte(transactions.txnDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(transactions.txnDate, filters.endDate));

    return db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.txnDate));
  }

  async getProjectTransactions(projectId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.projectId, projectId)).orderBy(desc(transactions.txnDate));
  }

  async createTransaction(data: InsertTransaction): Promise<Transaction> {
    const result = await db.insert(transactions).values(data).returning();
    return result[0];
  }

  async createTransactions(data: InsertTransaction[]): Promise<Transaction[]> {
    if (data.length === 0) return [];
    return db.insert(transactions).values(data).returning();
  }

  async getLaborEntries(companyId: string, filters?: { projectId?: string; startDate?: string; endDate?: string }): Promise<LaborEntry[]> {
    let conditions = [eq(laborEntries.companyId, companyId)];
    if (filters?.projectId) conditions.push(eq(laborEntries.projectId, filters.projectId));
    if (filters?.startDate) conditions.push(gte(laborEntries.laborDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(laborEntries.laborDate, filters.endDate));

    return db.select().from(laborEntries).where(and(...conditions)).orderBy(desc(laborEntries.laborDate));
  }

  async createLaborEntry(data: InsertLaborEntry): Promise<LaborEntry> {
    const result = await db.insert(laborEntries).values(data).returning();
    return result[0];
  }

  async createLaborEntries(data: InsertLaborEntry[]): Promise<LaborEntry[]> {
    if (data.length === 0) return [];
    return db.insert(laborEntries).values(data).returning();
  }

  async getWeeklyReports(companyId: string): Promise<WeeklyReport[]> {
    return db.select().from(weeklyReports).where(eq(weeklyReports.companyId, companyId)).orderBy(desc(weeklyReports.weekStart));
  }

  async getWeeklyReport(id: string): Promise<WeeklyReport | undefined> {
    const result = await db.select().from(weeklyReports).where(eq(weeklyReports.id, id));
    return result[0];
  }

  async getWeeklyReportByWeek(companyId: string, weekStart: string): Promise<WeeklyReport | undefined> {
    const result = await db.select().from(weeklyReports).where(and(
      eq(weeklyReports.companyId, companyId),
      eq(weeklyReports.weekStart, weekStart)
    ));
    return result[0];
  }

  async createWeeklyReport(data: InsertWeeklyReport): Promise<WeeklyReport> {
    const existing = await this.getWeeklyReportByWeek(data.companyId, data.weekStart);
    if (existing) {
      const updated = await db.update(weeklyReports)
        .set({ summary: data.summary, weekEnd: data.weekEnd })
        .where(eq(weeklyReports.id, existing.id))
        .returning();
      return updated[0];
    }
    const result = await db.insert(weeklyReports).values(data).returning();
    return result[0];
  }

  async getImportFiles(companyId: string): Promise<ImportFile[]> {
    return db.select().from(importFiles).where(eq(importFiles.companyId, companyId)).orderBy(desc(importFiles.uploadedAt));
  }

  async createImportFile(data: InsertImportFile): Promise<ImportFile> {
    const result = await db.insert(importFiles).values(data).returning();
    return result[0];
  }

  async updateImportFileStatus(id: string, status: string): Promise<void> {
    await db.update(importFiles).set({ status }).where(eq(importFiles.id, id));
  }

  async createImportRows(data: InsertImportRow[]): Promise<ImportRow[]> {
    if (data.length === 0) return [];
    return db.insert(importRows).values(data).returning();
  }

  async getProjectSummary(projectId: string): Promise<{ totalCost: number; totalRevenue: number; margin: number; transactionCount: number }> {
    const txns = await this.getProjectTransactions(projectId);
    let totalCost = 0;
    let totalRevenue = 0;

    for (const txn of txns) {
      const amount = parseFloat(txn.amount);
      if (txn.direction === "out") totalCost += amount;
      else totalRevenue += amount;
    }

    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    return { totalCost, totalRevenue, margin, transactionCount: txns.length };
  }

  async getCompanySettings(companyId: string): Promise<CompanySettings | undefined> {
    const result = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId));
    return result[0];
  }

  async upsertCompanySettings(companyId: string, data: Partial<InsertCompanySettings>): Promise<CompanySettings> {
    const existing = await this.getCompanySettings(companyId);
    if (existing) {
      const updated = await db.update(companySettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(companySettings.companyId, companyId))
        .returning();
      return updated[0];
    }
    const result = await db.insert(companySettings).values({ companyId, ...data }).returning();
    return result[0];
  }

  async getQbConnection(companyId: string): Promise<QbConnection | undefined> {
    const result = await db.select().from(qbConnections).where(eq(qbConnections.companyId, companyId));
    return result[0];
  }

  async upsertQbConnection(companyId: string, data: Partial<InsertQbConnection>): Promise<QbConnection> {
    const existing = await this.getQbConnection(companyId);
    if (existing) {
      const updated = await db.update(qbConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(qbConnections.companyId, companyId))
        .returning();
      return updated[0];
    }
    const result = await db.insert(qbConnections).values({ companyId, ...data }).returning();
    return result[0];
  }

  async deleteQbConnection(companyId: string): Promise<void> {
    await db.delete(qbConnections).where(eq(qbConnections.companyId, companyId));
  }

  async getIngestionJobs(companyId: string): Promise<IngestionJob[]> {
    return db.select().from(ingestionJobs).where(eq(ingestionJobs.companyId, companyId)).orderBy(desc(ingestionJobs.createdAt));
  }

  async getIngestionJob(id: string): Promise<IngestionJob | undefined> {
    const result = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, id));
    return result[0];
  }

  async createIngestionJob(data: InsertIngestionJob): Promise<IngestionJob> {
    const result = await db.insert(ingestionJobs).values(data).returning();
    return result[0];
  }

  // ✅ FIXED - Clears stale fields on completion
  async updateIngestionJobStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const updateData: {
      status: string;
      processedAt?: Date;
      errorMessage?: string | null;
      needsReview?: boolean;
      reviewReason?: string | null;
      reviewStatus?: string | null;
    } = { status };

    if (status === "completed" || status === "failed") {
      updateData.processedAt = new Date();
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    // When job completes successfully, clear all stale error/review fields
    if (status === "completed") {
      updateData.errorMessage = null;
      updateData.needsReview = false;
      updateData.reviewReason = null;
      updateData.reviewStatus = null;
    }

    await db.update(ingestionJobs).set(updateData).where(eq(ingestionJobs.id, id));
  }

  async updateIngestionJobExtractedText(id: string, extractedText: string): Promise<void> {
    await db.update(ingestionJobs).set({ extractedText }).where(eq(ingestionJobs.id, id));
  }

  async updateIngestionJobFileUrl(id: string, fileUrl: string): Promise<void> {
    await db.update(ingestionJobs).set({ fileUrl }).where(eq(ingestionJobs.id, id));
  }

  async getIngestionResults(jobId: string): Promise<IngestionResult[]> {
    return db.select().from(ingestionResults).where(eq(ingestionResults.ingestionJobId, jobId)).orderBy(desc(ingestionResults.createdAt));
  }

  async getIngestionResult(id: string): Promise<IngestionResult | undefined> {
    const result = await db.select().from(ingestionResults).where(eq(ingestionResults.id, id));
    return result[0];
  }

  async createIngestionResult(data: InsertIngestionResult): Promise<IngestionResult> {
    const result = await db.insert(ingestionResults).values(data).returning();
    return result[0];
  }

  async approveIngestionResult(id: string): Promise<IngestionResult> {
    const result = await db.update(ingestionResults)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(ingestionResults.id, id))
      .returning();
    return result[0];
  }

  async updateIngestionJobFinalResults(
    id: string,
    data: { finalCategorizedResultId?: string | null; finalParsedResultId?: string | null }
  ): Promise<void> {
    await db
      .update(ingestionJobs)
      .set({
        finalCategorizedResultId: data.finalCategorizedResultId ?? null,
        finalParsedResultId: data.finalParsedResultId ?? null,
      })
      .where(eq(ingestionJobs.id, id));
  }

  async deleteTransactionsBySourceRef(data: {
    companyId: string;
    source: string;
    sourceRef: string;
  }): Promise<number> {
    const deleted = await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.companyId, data.companyId),
          eq(transactions.source, data.source),
          eq(transactions.sourceRef, data.sourceRef)
        )
      )
      .returning({ id: transactions.id });

    return deleted.length;
  }

  // ========== VENDOR METHODS (NORMALIZED) ==========

  async findVendorByNormalizedName(companyId: string, normalizedName: string): Promise<Vendor | undefined> {
    const result = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.companyId, companyId), eq(vendors.normalizedName, normalizedName)));
    return result[0];
  }

  async findOrCreateVendor(companyId: string, vendorName: string): Promise<Vendor> {
    const normalizedName = vendorName.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");

    // Try to find existing vendor
    const existing = await this.findVendorByNormalizedName(companyId, normalizedName);
    if (existing) return existing;

    // Create new vendor
    const result = await db
      .insert(vendors)
      .values({ companyId, name: vendorName.trim(), normalizedName })
      .returning();
    return result[0];
  }

  // ========== REVIEW QUEUE METHODS ==========

  async updateIngestionJobReviewFields(
    id: string,
    data: {
      needsReview?: boolean;
      reviewReason?: string | null;
      reviewStatus?: string;
      reviewedAt?: Date | null;
      overrideTotal?: string | null;
      overrideVendorName?: string | null;
    }
  ): Promise<void> {
    await db.update(ingestionJobs).set(data).where(eq(ingestionJobs.id, id));
  }

  async listIngestionJobsNeedingReview(
    companyId: string,
    status: string = "pending",
    limit: number = 50
  ): Promise<IngestionJob[]> {
    return db
      .select()
      .from(ingestionJobs)
      .where(
        and(
          eq(ingestionJobs.companyId, companyId),
          eq(ingestionJobs.needsReview, true),
          eq(ingestionJobs.reviewStatus, status)
        )
      )
      .orderBy(desc(ingestionJobs.createdAt))
      .limit(limit);
  }

  // ========== SYNC INBOUND EMAILS ==========

  async findIngestionJobByFileUrl(fileUrl: string): Promise<IngestionJob | undefined> {
    const result = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.fileUrl, fileUrl));
    return result[0];
  }

  // ========== DEDUPE PROTECTION ==========

  async findDuplicateTransaction(params: {
    companyId: string;
    vendorId: string | null;
    amount: string;
    txnDate: string;
    lookbackDays?: number;
  }): Promise<Transaction | undefined> {
    const lookbackDays = params.lookbackDays ?? 7;

    // Calculate date range
    const txnDateObj = new Date(params.txnDate);
    const startDate = new Date(txnDateObj);
    startDate.setDate(startDate.getDate() - lookbackDays);
    const endDate = new Date(txnDateObj);
    endDate.setDate(endDate.getDate() + lookbackDays);

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    // Build conditions
    const conditions = [
      eq(transactions.companyId, params.companyId),
      eq(transactions.amount, params.amount),
      eq(transactions.source, "ingestion"),
      gte(transactions.txnDate, startStr),
      lte(transactions.txnDate, endStr),
    ];

    // Add vendorId condition if provided
    if (params.vendorId) {
      conditions.push(eq(transactions.vendorId, params.vendorId));
    }

    const result = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .limit(1);

    return result[0];
  }

  async getCompanyDashboard(companyId: string, weekStart: string, weekEnd: string): Promise<{
    totalCost: number;
    totalRevenue: number;
    grossMargin: number;
    laborCost: number;
    materialCost: number;
    equipmentCost: number;
    alerts: string[];
    projects: { id: string; name: string; cost: number; revenue: number; margin: number; status: string }[];
    insights: {
      costChangePercent: number;
      laborCostPercent: number;
      materialCostPercent: number;
      equipmentCostPercent: number;
      lowMarginProjects: { name: string; margin: number }[];
      largeTransactions: { description: string; amount: number; vendor: string | null }[];
      previousWeekCost: number;
    };
  }> {
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekEnd);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
    const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];
    const prevWeekEndStr = prevWeekEnd.toISOString().split('T')[0];

    const [txns, labor, projectList, prevTxns, prevLabor, settings] = await Promise.all([
      this.getTransactions(companyId, { startDate: weekStart, endDate: weekEnd }),
      this.getLaborEntries(companyId, { startDate: weekStart, endDate: weekEnd }),
      this.getProjects(companyId),
      this.getTransactions(companyId, { startDate: prevWeekStartStr, endDate: prevWeekEndStr }),
      this.getLaborEntries(companyId, { startDate: prevWeekStartStr, endDate: prevWeekEndStr }),
      this.getCompanySettings(companyId)
    ]);

    const costSpikeThreshold = settings?.costSpikeThreshold ? parseFloat(settings.costSpikeThreshold) : 10;
    const marginThreshold = settings?.marginThreshold ? parseFloat(settings.marginThreshold) : 25;
    const largeTxnThreshold = settings?.largeTxnThreshold ? parseFloat(settings.largeTxnThreshold) : 20000;
    const laborShareThreshold = settings?.laborShareThreshold ? parseFloat(settings.laborShareThreshold) : 50;

    let totalCost = 0;
    let totalRevenue = 0;
    let laborCost = 0;
    let materialCost = 0;
    let equipmentCost = 0;
    const largeTransactions: { description: string; amount: number; vendor: string | null }[] = [];
    const projectCosts: Record<string, { cost: number; revenue: number }> = {};

    for (const txn of txns) {
      const amount = parseFloat(txn.amount);
      if (txn.direction === "out") {
        totalCost += amount;
        if (txn.category === "labor") laborCost += amount;
        else if (txn.category === "material") materialCost += amount;
        else if (txn.category === "equipment") equipmentCost += amount;
        if (amount >= largeTxnThreshold) {
          largeTransactions.push({ description: txn.description || "Large expense", amount, vendor: txn.vendor });
        }
      } else {
        totalRevenue += amount;
      }
      if (txn.projectId) {
        if (!projectCosts[txn.projectId]) {
          projectCosts[txn.projectId] = { cost: 0, revenue: 0 };
        }
        if (txn.direction === "out") {
          projectCosts[txn.projectId].cost += amount;
        } else {
          projectCosts[txn.projectId].revenue += amount;
        }
      }
    }

    for (const entry of labor) {
      const hours = parseFloat(entry.hours || "0");
      const rate = parseFloat(entry.rate || "0");
      const cost = hours * rate;
      laborCost += cost;
      totalCost += cost;
      if (entry.projectId) {
        if (!projectCosts[entry.projectId]) {
          projectCosts[entry.projectId] = { cost: 0, revenue: 0 };
        }
        projectCosts[entry.projectId].cost += cost;
      }
    }

    let previousWeekCost = 0;
    for (const txn of prevTxns) {
      if (txn.direction === "out") {
        previousWeekCost += parseFloat(txn.amount);
      }
    }
    for (const entry of prevLabor) {
      previousWeekCost += parseFloat(entry.hours || "0") * parseFloat(entry.rate || "0");
    }

    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    const costChangePercent = previousWeekCost > 0 ? ((totalCost - previousWeekCost) / previousWeekCost) * 100 : 0;
    const laborCostPercent = totalCost > 0 ? (laborCost / totalCost) * 100 : 0;
    const materialCostPercent = totalCost > 0 ? (materialCost / totalCost) * 100 : 0;
    const equipmentCostPercent = totalCost > 0 ? (equipmentCost / totalCost) * 100 : 0;

    const alerts: string[] = [];
    if (costChangePercent > costSpikeThreshold) {
      alerts.push(`Cost increased ${costChangePercent.toFixed(0)}% from last week`);
    }
    if (totalRevenue > 0 && grossMargin < marginThreshold) {
      alerts.push(`Gross margin ${grossMargin.toFixed(1)}% is below ${marginThreshold}% target`);
    }
    if (laborCostPercent > laborShareThreshold) {
      alerts.push(`Labor is ${laborCostPercent.toFixed(0)}% of total costs (above ${laborShareThreshold}% threshold)`);
    }
    for (const lt of largeTransactions) {
      alerts.push(`Large transaction: ${lt.description} - $${lt.amount.toLocaleString()}`);
    }

    const projectsData = projectList.map(p => {
      const data = projectCosts[p.id] || { cost: 0, revenue: 0 };
      const margin = data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0;
      return { id: p.id, name: p.name, cost: data.cost, revenue: data.revenue, margin, status: p.status };
    });

    const lowMarginProjects = projectsData
      .filter(p => p.revenue > 0 && p.margin < marginThreshold)
      .map(p => ({ name: p.name, margin: p.margin }));

    return {
      totalCost,
      totalRevenue,
      grossMargin,
      laborCost,
      materialCost,
      equipmentCost,
      alerts,
      projects: projectsData,
      insights: {
        costChangePercent,
        laborCostPercent,
        materialCostPercent,
        equipmentCostPercent,
        lowMarginProjects,
        largeTransactions,
        previousWeekCost
      }
    };
  }

  // ========== INVOICES & LINE ITEMS ==========

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const result = await db.insert(invoices).values(data).returning();
    return result[0];
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const result = await db.select().from(invoices).where(eq(invoices.id, id));
    return result[0];
  }

  async getInvoicesByCompany(
    companyId: string,
    filters?: { projectId?: string; vendorId?: string; startDate?: string; endDate?: string; status?: string }
  ): Promise<Invoice[]> {
    let conditions = [eq(invoices.companyId, companyId)];
    if (filters?.projectId) conditions.push(eq(invoices.projectId, filters.projectId));
    if (filters?.vendorId) conditions.push(eq(invoices.vendorId, filters.vendorId));
    if (filters?.startDate) conditions.push(gte(invoices.invoiceDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(invoices.invoiceDate, filters.endDate));
    if (filters?.status) conditions.push(eq(invoices.status, filters.status));

    return db.select().from(invoices).where(and(...conditions)).orderBy(desc(invoices.createdAt));
  }

  async getInvoiceBySourceJob(sourceJobId: string): Promise<Invoice | undefined> {
    const result = await db.select().from(invoices).where(eq(invoices.sourceJobId, sourceJobId));
    return result[0];
  }

  async deleteInvoice(id: string): Promise<void> {
    // Line items cascade delete with the invoice (FK constraint)
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  // ========== DEDUPE SUPPORT (USES NORMALIZED INVOICE NUMBER) ==========

  async findInvoiceByDedupeKey(
    companyId: string,
    invoiceNumberNorm: string,
    invoiceDate: string | null,
    total: string
  ): Promise<Invoice | undefined> {
    // Skip dedupe if normalized invoice number is empty
    if (!invoiceNumberNorm) {
      return undefined;
    }

    const conditions = [
      eq(invoices.companyId, companyId),
      eq(invoices.invoiceNumberNorm, invoiceNumberNorm),
      eq(invoices.total, total),
    ];

    // Only include invoice_date in match if provided
    if (invoiceDate) {
      conditions.push(eq(invoices.invoiceDate, invoiceDate));
    }

    const result = await db
      .select()
      .from(invoices)
      .where(and(...conditions))
      .limit(1);

    return result[0];
  }

  async deleteInvoiceLineItems(invoiceId: string): Promise<number> {
    const result = await db
      .delete(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId))
      .returning({ id: invoiceLineItems.id });

    return result.length;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice> {
    const result = await db
      .update(invoices)
      .set(data)
      .where(eq(invoices.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error(`Invoice ${id} not found for update`);
    }
    return result[0];
  }

  async createInvoiceLineItems(data: InsertInvoiceLineItem[]): Promise<InvoiceLineItem[]> {
    if (data.length === 0) return [];
    return db.insert(invoiceLineItems).values(data).returning();
  }

  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    return db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
  }

  async getLineItemsByProject(
    projectId: string,
    filters?: { category?: string; vendor?: string }
  ): Promise<InvoiceLineItem[]> {
    // Join with invoices to filter by project
    const result = await db
      .select({
        lineItem: invoiceLineItems,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.projectId, projectId),
          filters?.category ? eq(invoiceLineItems.category, filters.category) : undefined
        )
      )
      .orderBy(desc(invoiceLineItems.createdAt));

    return result.map(r => r.lineItem);
  }

  async getLineItemsByCompany(
    companyId: string,
    filters?: { category?: string; vendorId?: string; q?: string }
  ): Promise<InvoiceLineItem[]> {
    let conditions = [eq(invoiceLineItems.companyId, companyId)];
    if (filters?.category) conditions.push(eq(invoiceLineItems.category, filters.category));

    // For vendor filter, we need to join with invoices
    if (filters?.vendorId) {
      const result = await db
        .select({ lineItem: invoiceLineItems })
        .from(invoiceLineItems)
        .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
        .where(
          and(
            eq(invoiceLineItems.companyId, companyId),
            eq(invoices.vendorId, filters.vendorId),
            filters?.category ? eq(invoiceLineItems.category, filters.category) : undefined
          )
        )
        .orderBy(desc(invoiceLineItems.createdAt));
      return result.map(r => r.lineItem);
    }

    return db
      .select()
      .from(invoiceLineItems)
      .where(and(...conditions))
      .orderBy(desc(invoiceLineItems.createdAt));
  }

  async getProjectMaterialsSummary(projectId: string): Promise<{
    totalMaterials: number;
    totalLabor: number;
    spendByCategory: Record<string, number>;
    topVendors: { vendor: string; total: number }[];
    invoiceCount: number;
    lineItemCount: number;
  }> {
    // Get all invoices for this project
    const projectInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, projectId));

    // Get all line items for these invoices
    const invoiceIds = projectInvoices.map(inv => inv.id);
    let allLineItems: InvoiceLineItem[] = [];
    if (invoiceIds.length > 0) {
      for (const invId of invoiceIds) {
        const items = await this.getInvoiceLineItems(invId);
        allLineItems.push(...items);
      }
    }

    // Get labor entries
    const labor = await this.getLaborEntries("", { projectId });

    // Calculate totals
    let totalMaterials = 0;
    const spendByCategory: Record<string, number> = {};
    const vendorTotals: Record<string, number> = {};

    for (const inv of projectInvoices) {
      const invTotal = parseFloat(inv.total || "0");
      totalMaterials += invTotal;

      const vendorName = inv.vendor || "Unknown";
      vendorTotals[vendorName] = (vendorTotals[vendorName] || 0) + invTotal;
    }

    for (const li of allLineItems) {
      const cat = li.category || "misc";
      const amount = parseFloat(li.lineAmount || "0");
      spendByCategory[cat] = (spendByCategory[cat] || 0) + amount;
    }

    let totalLabor = 0;
    for (const entry of labor) {
      const hours = parseFloat(entry.hours || "0");
      const rate = parseFloat(entry.rate || "0");
      totalLabor += hours * rate;
    }

    // Top vendors sorted by total
    const topVendors = Object.entries(vendorTotals)
      .map(([vendor, total]) => ({ vendor, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return {
      totalMaterials,
      totalLabor,
      spendByCategory,
      topVendors,
      invoiceCount: projectInvoices.length,
      lineItemCount: allLineItems.length,
    };
  }

  async findProjectByExternalRef(companyId: string, externalRef: string): Promise<Project | undefined> {
    const normalized = externalRef.toLowerCase().trim();
    const result = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.companyId, companyId),
          sql`LOWER(TRIM(${projects.externalRef})) = ${normalized}`
        )
      );
    return result[0];
  }

  async updateProject(
    id: string,
    data: Partial<InsertProject>
  ): Promise<Project> {
    const result = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return result[0];
  }

  // ========== PROJECT BUDGETS (TAKEOFFS) ==========
  async createProjectBudget(data: InsertProjectBudget): Promise<ProjectBudget> {
    const result = await db.insert(projectBudgets).values(data).returning();
    return result[0];
  }

  async getProjectBudget(id: string): Promise<ProjectBudget | undefined> {
    const result = await db.select().from(projectBudgets).where(eq(projectBudgets.id, id));
    return result[0];
  }

  async getProjectBudgets(projectId: string): Promise<ProjectBudget[]> {
    return db.select().from(projectBudgets)
      .where(eq(projectBudgets.projectId, projectId))
      .orderBy(desc(projectBudgets.createdAt));
  }

  async updateProjectBudget(id: string, data: Partial<InsertProjectBudget>): Promise<ProjectBudget> {
    const result = await db.update(projectBudgets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectBudgets.id, id))
      .returning();
    return result[0];
  }

  async deleteProjectBudget(id: string): Promise<void> {
    await db.delete(projectBudgets).where(eq(projectBudgets.id, id));
  }

  // Budget Line Items
  async createBudgetLineItems(data: InsertBudgetLineItem[]): Promise<BudgetLineItem[]> {
    if (data.length === 0) return [];
    return db.insert(budgetLineItems).values(data).returning();
  }

  async getBudgetLineItems(budgetId: string): Promise<BudgetLineItem[]> {
    return db.select().from(budgetLineItems)
      .where(eq(budgetLineItems.budgetId, budgetId))
      .orderBy(budgetLineItems.category);
  }

  async updateBudgetLineItem(id: string, data: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem> {
    const result = await db.update(budgetLineItems)
      .set(data)
      .where(eq(budgetLineItems.id, id))
      .returning();
    return result[0];
  }

  async deleteBudgetLineItem(id: string): Promise<void> {
    await db.delete(budgetLineItems).where(eq(budgetLineItems.id, id));
  }

  // ========== PAYMENT PHASES ==========
  async createPaymentPhase(data: InsertPaymentPhase): Promise<PaymentPhase> {
    const result = await db.insert(paymentPhases).values(data).returning();
    return result[0];
  }

  async getPaymentPhases(projectId: string): Promise<PaymentPhase[]> {
    return db.select().from(paymentPhases)
      .where(eq(paymentPhases.projectId, projectId))
      .orderBy(paymentPhases.sequenceOrder);
  }

  async getPaymentPhase(id: string): Promise<PaymentPhase | undefined> {
    const result = await db.select().from(paymentPhases).where(eq(paymentPhases.id, id));
    return result[0];
  }

  async updatePaymentPhase(id: string, data: Partial<InsertPaymentPhase>): Promise<PaymentPhase> {
    const result = await db.update(paymentPhases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentPhases.id, id))
      .returning();
    return result[0];
  }

  async deletePaymentPhase(id: string): Promise<void> {
    await db.delete(paymentPhases).where(eq(paymentPhases.id, id));
  }

  // Payment Records
  async createPaymentRecord(data: InsertPaymentRecord): Promise<PaymentRecord> {
    const result = await db.insert(paymentRecords).values(data).returning();
    return result[0];
  }

  async getPaymentRecords(phaseId: string): Promise<PaymentRecord[]> {
    return db.select().from(paymentRecords)
      .where(eq(paymentRecords.phaseId, phaseId))
      .orderBy(desc(paymentRecords.paymentDate));
  }

  async getProjectPaymentRecords(projectId: string): Promise<PaymentRecord[]> {
    return db.select().from(paymentRecords)
      .where(eq(paymentRecords.projectId, projectId))
      .orderBy(desc(paymentRecords.paymentDate));
  }

  async deletePaymentRecord(id: string): Promise<void> {
    await db.delete(paymentRecords).where(eq(paymentRecords.id, id));
  }

  // ========== PROJECT FINANCIALS (COMPUTED) ==========
  async getProjectFinancials(projectId: string): Promise<ProjectFinancials> {
    // Get project info
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    // Get budget
    const budgets = await this.getProjectBudgets(projectId);
    const activeBudget = budgets.find(b => b.status === "active") || budgets[0];

    const contractValue = activeBudget ? parseFloat(activeBudget.contractValue) : 0;
    const estimatedCost = activeBudget ? parseFloat(activeBudget.estimatedCost || "0") : 0;
    const estimatedProfit = activeBudget ? parseFloat(activeBudget.estimatedProfit || "0") : contractValue - estimatedCost;
    const estimatedMargin = contractValue > 0 ? (estimatedProfit / contractValue) * 100 : 0;

    // Get actual costs from invoices
    const projectInvoices = await db.select().from(invoices).where(eq(invoices.projectId, projectId));
    const costsToDate = projectInvoices.reduce((sum, inv) => sum + parseFloat(inv.total || "0"), 0);

    // Get payment phases and records
    const phases = await this.getPaymentPhases(projectId);
    const allPayments = await this.getProjectPaymentRecords(projectId);

    const totalInvoiced = phases
      .filter(p => p.status === "invoiced" || p.status === "partial" || p.status === "paid")
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const revenueToDate = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const outstandingReceivables = totalInvoiced - revenueToDate;

    // Calculate profit and margins
    const profitToDate = revenueToDate - costsToDate;
    const actualMargin = revenueToDate > 0 ? (profitToDate / revenueToDate) * 100 : 0;

    // Budget tracking
    const budgetRemaining = estimatedCost - costsToDate;
    const budgetVariance = budgetRemaining; // Positive = under budget
    const percentComplete = estimatedCost > 0 ? (costsToDate / estimatedCost) * 100 : 0;

    // Generate alerts
    const alerts: string[] = [];
    const isOverBudget = budgetVariance < 0;
    const isUnderperforming = actualMargin < estimatedMargin - 5; // 5% threshold

    if (isOverBudget) {
      alerts.push(`Over budget by $${Math.abs(budgetVariance).toFixed(2)}`);
    }
    if (isUnderperforming && revenueToDate > 0) {
      alerts.push(`Margin ${actualMargin.toFixed(1)}% below target ${estimatedMargin.toFixed(1)}%`);
    }
    if (outstandingReceivables > 0) {
      alerts.push(`Outstanding receivables: $${outstandingReceivables.toFixed(2)}`);
    }

    return {
      projectId,
      projectName: project.name,
      contractValue,
      estimatedCost,
      estimatedProfit,
      estimatedMargin,
      costsToDate,
      revenueToDate,
      profitToDate,
      actualMargin,
      budgetRemaining,
      budgetVariance,
      percentComplete,
      totalInvoiced,
      totalPaid: revenueToDate,
      outstandingReceivables,
      isOverBudget,
      isUnderperforming,
      alerts,
    };
  }

  async getCompanyProjectsFinancials(companyId: string): Promise<ProjectFinancials[]> {
    const companyProjects = await this.getProjects(companyId);
    const financials: ProjectFinancials[] = [];

    for (const project of companyProjects) {
      try {
        const projectFinancials = await this.getProjectFinancials(project.id);
        financials.push(projectFinancials);
      } catch (err) {
        // Skip projects that error (e.g., no budget set up)
        console.warn(`[getCompanyProjectsFinancials] Skipping project ${project.id}:`, err);
      }
    }

    return financials.sort((a, b) => b.costsToDate - a.costsToDate);
  }

  // ========== GENERAL CONTRACTORS ==========
  async createGeneralContractor(data: InsertGeneralContractor): Promise<GeneralContractor> {
    const result = await db.insert(generalContractors).values(data).returning();
    return result[0];
  }

  async getGeneralContractors(companyId: string): Promise<GeneralContractor[]> {
    return db.select().from(generalContractors)
      .where(eq(generalContractors.companyId, companyId))
      .orderBy(generalContractors.name);
  }

  async getGeneralContractor(id: string): Promise<GeneralContractor | undefined> {
    const result = await db.select().from(generalContractors).where(eq(generalContractors.id, id));
    return result[0];
  }

  async updateGeneralContractor(id: string, data: Partial<InsertGeneralContractor>): Promise<GeneralContractor> {
    const result = await db.update(generalContractors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(generalContractors.id, id))
      .returning();
    return result[0];
  }

  async deleteGeneralContractor(id: string): Promise<void> {
    await db.delete(generalContractors).where(eq(generalContractors.id, id));
  }

  // ========== CHANGE ORDERS ==========
  async createChangeOrder(data: InsertChangeOrder): Promise<ChangeOrder> {
    const result = await db.insert(changeOrders).values(data).returning();
    return result[0];
  }

  async getChangeOrders(projectId: string): Promise<ChangeOrder[]> {
    return db.select().from(changeOrders)
      .where(eq(changeOrders.projectId, projectId))
      .orderBy(changeOrders.coNumber);
  }

  async getChangeOrder(id: string): Promise<ChangeOrder | undefined> {
    const result = await db.select().from(changeOrders).where(eq(changeOrders.id, id));
    return result[0];
  }

  async updateChangeOrder(id: string, data: Partial<InsertChangeOrder>): Promise<ChangeOrder> {
    const result = await db.update(changeOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(changeOrders.id, id))
      .returning();
    return result[0];
  }

  async deleteChangeOrder(id: string): Promise<void> {
    await db.delete(changeOrders).where(eq(changeOrders.id, id));
  }

  async getChangeOrdersByGc(gcId: string): Promise<ChangeOrder[]> {
    return db.select().from(changeOrders)
      .where(eq(changeOrders.gcId, gcId))
      .orderBy(desc(changeOrders.createdAt));
  }

  // ========== PROJECT INVOICES (Invoices TO GC) ==========
  async createProjectInvoice(data: InsertProjectInvoice): Promise<ProjectInvoice> {
    const result = await db.insert(projectInvoices).values(data).returning();
    return result[0];
  }

  async getProjectInvoices(projectId: string): Promise<ProjectInvoice[]> {
    return db.select().from(projectInvoices)
      .where(eq(projectInvoices.projectId, projectId))
      .orderBy(desc(projectInvoices.invoiceDate));
  }

  async getProjectInvoice(id: string): Promise<ProjectInvoice | undefined> {
    const result = await db.select().from(projectInvoices).where(eq(projectInvoices.id, id));
    return result[0];
  }

  async updateProjectInvoice(id: string, data: Partial<InsertProjectInvoice>): Promise<ProjectInvoice> {
    const result = await db.update(projectInvoices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectInvoices.id, id))
      .returning();
    return result[0];
  }

  async deleteProjectInvoice(id: string): Promise<void> {
    await db.delete(projectInvoices).where(eq(projectInvoices.id, id));
  }

  async getProjectInvoicesByGc(gcId: string): Promise<ProjectInvoice[]> {
    return db.select().from(projectInvoices)
      .where(eq(projectInvoices.gcId, gcId))
      .orderBy(desc(projectInvoices.invoiceDate));
  }

  // ========== PAYMENTS RECEIVED (From GC) ==========
  async createPaymentReceived(data: InsertPaymentReceived): Promise<PaymentReceived> {
    const result = await db.insert(paymentsReceived).values(data).returning();
    return result[0];
  }

  async getPaymentsReceived(projectId: string): Promise<PaymentReceived[]> {
    return db.select().from(paymentsReceived)
      .where(eq(paymentsReceived.projectId, projectId))
      .orderBy(desc(paymentsReceived.paymentDate));
  }

  async getPaymentReceived(id: string): Promise<PaymentReceived | undefined> {
    const result = await db.select().from(paymentsReceived).where(eq(paymentsReceived.id, id));
    return result[0];
  }

  async deletePaymentReceived(id: string): Promise<void> {
    await db.delete(paymentsReceived).where(eq(paymentsReceived.id, id));
  }

  async getPaymentsReceivedByInvoice(projectInvoiceId: string): Promise<PaymentReceived[]> {
    return db.select().from(paymentsReceived)
      .where(eq(paymentsReceived.projectInvoiceId, projectInvoiceId))
      .orderBy(desc(paymentsReceived.paymentDate));
  }

  // ========== WORKERS ==========
  async createWorker(data: InsertWorker): Promise<Worker> {
    const result = await db.insert(workers).values(data).returning();
    return result[0];
  }

  async getWorkers(companyId: string): Promise<Worker[]> {
    return db.select().from(workers)
      .where(eq(workers.companyId, companyId))
      .orderBy(workers.name);
  }

  async getWorker(id: string): Promise<Worker | undefined> {
    const result = await db.select().from(workers).where(eq(workers.id, id));
    return result[0];
  }

  async updateWorker(id: string, data: Partial<InsertWorker>): Promise<Worker> {
    const result = await db.update(workers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workers.id, id))
      .returning();
    return result[0];
  }

  async deleteWorker(id: string): Promise<void> {
    await db.delete(workers).where(eq(workers.id, id));
  }

  async findWorkerByName(companyId: string, name: string): Promise<Worker | undefined> {
    const normalizedName = name.toLowerCase().trim();
    const result = await db.select().from(workers)
      .where(
        and(
          eq(workers.companyId, companyId),
          sql`LOWER(TRIM(${workers.name})) = ${normalizedName}`
        )
      );
    return result[0];
  }

  // ========== PAYROLL ENTRIES ==========
  async createPayrollEntry(data: InsertPayrollEntry): Promise<PayrollEntry> {
    const result = await db.insert(payrollEntries).values(data).returning();
    return result[0];
  }

  async createPayrollEntries(data: InsertPayrollEntry[]): Promise<PayrollEntry[]> {
    if (data.length === 0) return [];
    return db.insert(payrollEntries).values(data).returning();
  }

  async getPayrollEntries(
    companyId: string,
    filters?: { projectId?: string; workerId?: string; weekStart?: string; weekEnd?: string }
  ): Promise<PayrollEntry[]> {
    let conditions = [eq(payrollEntries.companyId, companyId)];
    if (filters?.projectId) conditions.push(eq(payrollEntries.projectId, filters.projectId));
    if (filters?.workerId) conditions.push(eq(payrollEntries.workerId, filters.workerId));
    if (filters?.weekStart) conditions.push(gte(payrollEntries.weekStart, filters.weekStart));
    if (filters?.weekEnd) conditions.push(lte(payrollEntries.weekEnd, filters.weekEnd));

    return db.select().from(payrollEntries)
      .where(and(...conditions))
      .orderBy(desc(payrollEntries.weekStart));
  }

  async getPayrollEntriesByProject(projectId: string): Promise<PayrollEntry[]> {
    return db.select().from(payrollEntries)
      .where(eq(payrollEntries.projectId, projectId))
      .orderBy(desc(payrollEntries.weekStart));
  }

  async getPayrollEntriesByWorker(workerId: string): Promise<PayrollEntry[]> {
    return db.select().from(payrollEntries)
      .where(eq(payrollEntries.workerId, workerId))
      .orderBy(desc(payrollEntries.weekStart));
  }

  async getPayrollEntriesByWeek(companyId: string, weekStart: string): Promise<PayrollEntry[]> {
    return db.select().from(payrollEntries)
      .where(
        and(
          eq(payrollEntries.companyId, companyId),
          eq(payrollEntries.weekStart, weekStart)
        )
      )
      .orderBy(payrollEntries.workerId);
  }

  async getPayrollEntry(id: string): Promise<PayrollEntry | undefined> {
    const result = await db.select().from(payrollEntries).where(eq(payrollEntries.id, id));
    return result[0];
  }

  async updatePayrollEntry(id: string, data: Partial<InsertPayrollEntry>): Promise<PayrollEntry> {
    const result = await db.update(payrollEntries)
      .set(data)
      .where(eq(payrollEntries.id, id))
      .returning();
    return result[0];
  }

  async deletePayrollEntry(id: string): Promise<void> {
    await db.delete(payrollEntries).where(eq(payrollEntries.id, id));
  }

  async deletePayrollEntriesByWeek(companyId: string, weekStart: string): Promise<number> {
    const result = await db.delete(payrollEntries)
      .where(
        and(
          eq(payrollEntries.companyId, companyId),
          eq(payrollEntries.weekStart, weekStart)
        )
      )
      .returning({ id: payrollEntries.id });
    return result.length;
  }

  // ========== PAYROLL SUMMARY METHODS ==========
  async getProjectLaborCost(projectId: string): Promise<number> {
    const entries = await this.getPayrollEntriesByProject(projectId);
    return entries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);
  }

  async getProjectLaborCostByWeek(projectId: string, weekStart: string, weekEnd: string): Promise<number> {
    const result = await db.select().from(payrollEntries)
      .where(
        and(
          eq(payrollEntries.projectId, projectId),
          gte(payrollEntries.weekStart, weekStart),
          lte(payrollEntries.weekEnd, weekEnd)
        )
      );
    return result.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);
  }

  // ========== ESTIMATES/PROPOSALS ==========
  async createEstimate(data: InsertEstimate): Promise<Estimate> {
    const result = await db.insert(estimates).values(data).returning();
    return result[0];
  }

  async getEstimates(companyId: string): Promise<Estimate[]> {
    return db.select().from(estimates)
      .where(eq(estimates.companyId, companyId))
      .orderBy(desc(estimates.createdAt));
  }

  async getEstimate(id: string): Promise<Estimate | undefined> {
    const result = await db.select().from(estimates).where(eq(estimates.id, id));
    return result[0];
  }

  async updateEstimate(id: string, data: Partial<InsertEstimate>): Promise<Estimate> {
    const result = await db.update(estimates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(estimates.id, id))
      .returning();
    return result[0];
  }

  async deleteEstimate(id: string): Promise<void> {
    // First delete line items
    await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, id));
    // Then delete estimate
    await db.delete(estimates).where(eq(estimates.id, id));
  }

  async createEstimateLineItem(data: InsertEstimateLineItem): Promise<EstimateLineItem> {
    const result = await db.insert(estimateLineItems).values(data).returning();
    return result[0];
  }

  async getEstimateLineItems(estimateId: string): Promise<EstimateLineItem[]> {
    return db.select().from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, estimateId))
      .orderBy(estimateLineItems.sortOrder);
  }

  async updateEstimateLineItem(id: string, data: Partial<InsertEstimateLineItem>): Promise<EstimateLineItem> {
    const result = await db.update(estimateLineItems)
      .set(data)
      .where(eq(estimateLineItems.id, id))
      .returning();
    return result[0];
  }

  async deleteEstimateLineItem(id: string): Promise<void> {
    await db.delete(estimateLineItems).where(eq(estimateLineItems.id, id));
  }

  async convertEstimateToProject(estimateId: string): Promise<Project> {
    const estimate = await this.getEstimate(estimateId);
    if (!estimate) throw new Error("Estimate not found");

    // Create project from estimate
    const project = await this.createProject({
      companyId: estimate.companyId,
      gcId: estimate.gcId || undefined,
      name: estimate.name,
      address: estimate.projectAddress || undefined,
      initialProposal: estimate.totalAmount,
      status: "active",
      notes: `Converted from Estimate #${estimate.estimateNumber}`,
    });

    // Update estimate with project link
    await this.updateEstimate(estimateId, {
      status: "accepted",
      convertedToProjectId: project.id,
      respondedAt: new Date(),
    });

    return project;
  }

  // ========== PORTFOLIO SUMMARY ==========
  async getCompanyPortfolioSummary(companyId: string): Promise<{
    totalInitialContract: number;
    totalApprovedCOs: number;
    totalContractValue: number;
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRate: number;
    activeProjectCount: number;
    totalProjectCount: number;
    pendingCOCount: number;
    pendingCOValue: number;
    recentInvoices: Array<{
      id: string;
      invoiceNumber: string;
      amount: string;
      invoiceDate: string;
      projectName: string;
      projectId: string;
      status: string;
    }>;
    recentPayments: Array<{
      id: string;
      amount: string;
      paymentDate: string;
      paymentMethod: string | null;
      referenceNumber: string | null;
      projectName: string;
      projectId: string;
    }>;
    projectsNeedingAttention: Array<{
      id: string;
      name: string;
      reason: string;
      value?: number;
    }>;
  }> {
    // Get all projects for this company
    const allProjects = await this.getProjects(companyId);
    const activeProjects = allProjects.filter(p => p.status === "active");

    // Initialize totals
    let totalInitialContract = 0;
    let totalApprovedCOs = 0;
    let totalBilled = 0;
    let totalCollected = 0;
    let pendingCOCount = 0;
    let pendingCOValue = 0;

    const projectsNeedingAttention: Array<{ id: string; name: string; reason: string; value?: number }> = [];

    // Aggregate data from each project
    for (const project of allProjects) {
      // Initial contract value
      const initialContract = parseFloat(project.initialProposal || "0");
      totalInitialContract += initialContract;

      // Get change orders for this project
      const cos = await this.getChangeOrders(project.id);
      for (const co of cos) {
        const coAmount = parseFloat(co.amount);
        if (co.status === "approved" || co.status === "invoiced") {
          totalApprovedCOs += coAmount;
        } else if (co.status === "pending") {
          pendingCOCount++;
          pendingCOValue += coAmount;
        }
      }

      // Get invoices for this project
      const invoices = await this.getProjectInvoices(project.id);
      const projectBilled = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
      totalBilled += projectBilled;

      // Get payments for this project
      const payments = await this.getPaymentsReceived(project.id);
      const projectCollected = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      totalCollected += projectCollected;

      // Check if project needs attention
      const projectContractValue = initialContract + cos.filter(co => co.status === "approved" || co.status === "invoiced").reduce((sum, co) => sum + parseFloat(co.amount), 0);
      const projectOutstanding = projectBilled - projectCollected;

      // Flag projects with high outstanding balances (>30% of contract value billed but not collected)
      if (projectOutstanding > 0 && projectBilled > 0) {
        const collectionRate = (projectCollected / projectBilled) * 100;
        if (collectionRate < 50 && projectOutstanding > 5000) {
          projectsNeedingAttention.push({
            id: project.id,
            name: project.name,
            reason: `Low collection rate (${collectionRate.toFixed(0)}%)`,
            value: projectOutstanding,
          });
        }
      }

      // Flag projects with many pending COs
      const projectPendingCOs = cos.filter(co => co.status === "pending");
      if (projectPendingCOs.length >= 3) {
        projectsNeedingAttention.push({
          id: project.id,
          name: project.name,
          reason: `${projectPendingCOs.length} pending change orders`,
          value: projectPendingCOs.reduce((sum, co) => sum + parseFloat(co.amount), 0),
        });
      }
    }

    // Get recent invoices (last 5)
    const allInvoices: Array<{
      id: string;
      invoiceNumber: string;
      amount: string;
      invoiceDate: string;
      projectName: string;
      projectId: string;
      status: string;
    }> = [];

    for (const project of allProjects) {
      const invoices = await this.getProjectInvoices(project.id);
      for (const inv of invoices) {
        allInvoices.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          invoiceDate: inv.invoiceDate,
          projectName: project.name,
          projectId: project.id,
          status: inv.status,
        });
      }
    }
    const recentInvoices = allInvoices
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
      .slice(0, 5);

    // Get recent payments (last 5)
    const allPayments: Array<{
      id: string;
      amount: string;
      paymentDate: string;
      paymentMethod: string | null;
      referenceNumber: string | null;
      projectName: string;
      projectId: string;
    }> = [];

    for (const project of allProjects) {
      const payments = await this.getPaymentsReceived(project.id);
      for (const p of payments) {
        allPayments.push({
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          referenceNumber: p.referenceNumber,
          projectName: project.name,
          projectId: project.id,
        });
      }
    }
    const recentPayments = allPayments
      .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
      .slice(0, 5);

    const totalContractValue = totalInitialContract + totalApprovedCOs;
    const totalOutstanding = totalBilled - totalCollected;
    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

    return {
      totalInitialContract,
      totalApprovedCOs,
      totalContractValue,
      totalBilled,
      totalCollected,
      totalOutstanding,
      collectionRate,
      activeProjectCount: activeProjects.length,
      totalProjectCount: allProjects.length,
      pendingCOCount,
      pendingCOValue,
      recentInvoices,
      recentPayments,
      projectsNeedingAttention: projectsNeedingAttention.slice(0, 5),
    };
  }

  // ========== DAILY LOGS ==========
  async createDailyLog(data: InsertDailyLog): Promise<DailyLog> {
    const result = await db.insert(dailyLogs).values(data).returning();
    return result[0];
  }

  async getDailyLogs(companyId: string, filters?: { projectId?: string; startDate?: string; endDate?: string }): Promise<DailyLog[]> {
    let conditions = [eq(dailyLogs.companyId, companyId)];
    if (filters?.projectId) conditions.push(eq(dailyLogs.projectId, filters.projectId));
    if (filters?.startDate) conditions.push(gte(dailyLogs.logDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(dailyLogs.logDate, filters.endDate));

    return db.select().from(dailyLogs)
      .where(and(...conditions))
      .orderBy(desc(dailyLogs.logDate));
  }

  async getDailyLog(id: string): Promise<DailyLog | undefined> {
    const result = await db.select().from(dailyLogs).where(eq(dailyLogs.id, id));
    return result[0];
  }

  async getDailyLogByDate(projectId: string, logDate: string): Promise<DailyLog | undefined> {
    const result = await db.select().from(dailyLogs)
      .where(and(eq(dailyLogs.projectId, projectId), eq(dailyLogs.logDate, logDate)));
    return result[0];
  }

  async updateDailyLog(id: string, data: Partial<InsertDailyLog>): Promise<DailyLog> {
    const result = await db.update(dailyLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dailyLogs.id, id))
      .returning();
    return result[0];
  }

  async deleteDailyLog(id: string): Promise<void> {
    await db.delete(dailyLogs).where(eq(dailyLogs.id, id));
  }

  // ========== NOTIFICATIONS ==========
  async createNotification(data: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(data).returning();
    return result[0];
  }

  async getNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
    let conditions = [eq(notifications.userId, userId)];
    if (options?.unreadOnly) conditions.push(eq(notifications.read, false));

    const query = db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));

    if (options?.limit) {
      return query.limit(options.limit);
    }
    return query;
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return Number(result[0]?.count || 0);
  }

  async markNotificationRead(id: string): Promise<Notification> {
    const result = await db.update(notifications)
      .set({ read: true, readAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    return result[0];
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  // ========== NOTIFICATION PREFERENCES ==========
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    const result = await db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    return result[0];
  }

  async upsertNotificationPreferences(userId: string, data: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    const existing = await this.getNotificationPreferences(userId);
    if (existing) {
      const result = await db.update(notificationPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(notificationPreferences.userId, userId))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(notificationPreferences)
        .values({ userId, ...data })
        .returning();
      return result[0];
    }
  }
}

export const storage = new DatabaseStorage();
