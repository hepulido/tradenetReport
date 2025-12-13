import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  companies, projects, vendors, transactions, laborEntries,
  weeklyReports, importFiles, importRows,
  type Company, type Project, type Vendor, type Transaction,
  type LaborEntry, type WeeklyReport, type ImportFile, type ImportRow,
  type InsertCompany, type InsertProject, type InsertVendor, type InsertTransaction,
  type InsertLaborEntry, type InsertWeeklyReport, type InsertImportFile, type InsertImportRow,
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
  getCompanyDashboard(companyId: string, weekStart: string, weekEnd: string): Promise<{
    totalCost: number;
    totalRevenue: number;
    grossMargin: number;
    laborCost: number;
    materialCost: number;
    equipmentCost: number;
    alerts: string[];
    projects: { id: string; name: string; cost: number; revenue: number; margin: number; status: string }[];
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
  }> {
    const [txns, labor, projectList] = await Promise.all([
      this.getTransactions(companyId, { startDate: weekStart, endDate: weekEnd }),
      this.getLaborEntries(companyId, { startDate: weekStart, endDate: weekEnd }),
      this.getProjects(companyId)
    ]);

    let totalCost = 0;
    let totalRevenue = 0;
    let laborCost = 0;
    let materialCost = 0;
    let equipmentCost = 0;

    const projectCosts: Record<string, { cost: number; revenue: number }> = {};

    for (const txn of txns) {
      const amount = parseFloat(txn.amount);
      if (txn.direction === "out") {
        totalCost += amount;
        if (txn.category === "labor") laborCost += amount;
        else if (txn.category === "material") materialCost += amount;
        else if (txn.category === "equipment") equipmentCost += amount;
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
      const cost = parseFloat(entry.hours) * parseFloat(entry.rate || "0");
      laborCost += cost;
      totalCost += cost;
      if (entry.projectId) {
        if (!projectCosts[entry.projectId]) {
          projectCosts[entry.projectId] = { cost: 0, revenue: 0 };
        }
        projectCosts[entry.projectId].cost += cost;
      }
    }

    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

    const alerts: string[] = [];
    if (grossMargin < 15) {
      alerts.push(`Low margin warning: ${grossMargin.toFixed(1)}% is below target`);
    }
    if (laborCost > totalCost * 0.5) {
      alerts.push("Labor costs exceed 50% of total expenses");
    }

    const projectsData = projectList.map(p => {
      const data = projectCosts[p.id] || { cost: 0, revenue: 0 };
      const margin = data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0;
      return {
        id: p.id,
        name: p.name,
        cost: data.cost,
        revenue: data.revenue,
        margin,
        status: p.status
      };
    });

    return {
      totalCost,
      totalRevenue,
      grossMargin,
      laborCost,
      materialCost,
      equipmentCost,
      alerts,
      projects: projectsData
    };
  }
}

export const storage = new DatabaseStorage();
