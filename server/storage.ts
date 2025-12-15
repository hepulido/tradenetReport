import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  companies, projects, vendors, transactions, laborEntries,
  weeklyReports, importFiles, importRows, companySettings, qbConnections,
  type Company, type Project, type Vendor, type Transaction,
  type LaborEntry, type WeeklyReport, type ImportFile, type ImportRow,
  type CompanySettings, type QbConnection,
  type InsertCompany, type InsertProject, type InsertVendor, type InsertTransaction,
  type InsertLaborEntry, type InsertWeeklyReport, type InsertImportFile, type InsertImportRow,
  type InsertCompanySettings, type InsertQbConnection,
  type ReportSummary
} from "@shared/schema";

export interface IStorage {
  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(data: InsertCompany): Promise<Company>;

  getProjects(companyId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
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
}

export class DatabaseStorage implements IStorage {
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

  async getProject(id: string): Promise<Project | undefined> {
    const result = await db.select().from(projects).where(eq(projects.id, id));
    return result[0];
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
    if (filters?.projectId) {
      conditions.push(eq(transactions.projectId, filters.projectId));
    }
    if (filters?.startDate) {
      conditions.push(gte(transactions.txnDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(transactions.txnDate, filters.endDate));
    }
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
    const result = await db.insert(transactions).values(data).returning();
    return result;
  }

  async getLaborEntries(companyId: string, filters?: { projectId?: string; startDate?: string; endDate?: string }): Promise<LaborEntry[]> {
    let conditions = [eq(laborEntries.companyId, companyId)];
    if (filters?.projectId) {
      conditions.push(eq(laborEntries.projectId, filters.projectId));
    }
    if (filters?.startDate) {
      conditions.push(gte(laborEntries.laborDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(laborEntries.laborDate, filters.endDate));
    }
    return db.select().from(laborEntries).where(and(...conditions)).orderBy(desc(laborEntries.laborDate));
  }

  async createLaborEntry(data: InsertLaborEntry): Promise<LaborEntry> {
    const result = await db.insert(laborEntries).values(data).returning();
    return result[0];
  }

  async createLaborEntries(data: InsertLaborEntry[]): Promise<LaborEntry[]> {
    if (data.length === 0) return [];
    const result = await db.insert(laborEntries).values(data).returning();
    return result;
  }

  async getWeeklyReports(companyId: string): Promise<WeeklyReport[]> {
    return db.select().from(weeklyReports).where(eq(weeklyReports.companyId, companyId)).orderBy(desc(weeklyReports.weekStart));
  }

  async getWeeklyReport(id: string): Promise<WeeklyReport | undefined> {
    const result = await db.select().from(weeklyReports).where(eq(weeklyReports.id, id));
    return result[0];
  }

  async getWeeklyReportByWeek(companyId: string, weekStart: string): Promise<WeeklyReport | undefined> {
    const result = await db.select().from(weeklyReports).where(
      and(eq(weeklyReports.companyId, companyId), eq(weeklyReports.weekStart, weekStart))
    );
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
    const result = await db.insert(importRows).values(data).returning();
    return result;
  }

  async getProjectSummary(projectId: string): Promise<{ totalCost: number; totalRevenue: number; margin: number; transactionCount: number }> {
    const txns = await this.getProjectTransactions(projectId);
    let totalCost = 0;
    let totalRevenue = 0;
    for (const txn of txns) {
      const amount = parseFloat(txn.amount);
      if (txn.direction === "out") {
        totalCost += amount;
      } else {
        totalRevenue += amount;
      }
    }
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    return { totalCost, totalRevenue, margin, transactionCount: txns.length };
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
}

export const storage = new DatabaseStorage();
