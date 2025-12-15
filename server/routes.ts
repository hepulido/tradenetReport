import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import {
  insertCompanySchema, insertProjectSchema, insertTransactionSchema,
  insertWeeklyReportSchema, insertLaborEntrySchema, insertCompanySettingsSchema,
  type ReportSummary
} from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Companies
  app.get("/api/companies", async (_req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);
      res.status(201).json(company);
    } catch (error) {
      res.status(400).json({ error: "Invalid company data" });
    }
  });

  // Projects
  app.get("/api/companies/:companyId/projects", async (req, res) => {
    try {
      const projects = await storage.getProjects(req.params.companyId);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.post("/api/companies/:companyId/projects", async (req, res) => {
    try {
      const data = insertProjectSchema.parse({ ...req.body, companyId: req.params.companyId });
      const project = await storage.createProject(data);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.get("/api/projects/:id/transactions", async (req, res) => {
    try {
      const transactions = await storage.getProjectTransactions(req.params.id);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/projects/:id/summary", async (req, res) => {
    try {
      const summary = await storage.getProjectSummary(req.params.id);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project summary" });
    }
  });

  // Transactions
  app.get("/api/companies/:companyId/transactions", async (req, res) => {
    try {
      const { projectId, startDate, endDate } = req.query;
      const transactions = await storage.getTransactions(req.params.companyId, {
        projectId: projectId as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined
      });
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/companies/:companyId/transactions", async (req, res) => {
    try {
      const data = insertTransactionSchema.parse({ ...req.body, companyId: req.params.companyId });
      const transaction = await storage.createTransaction(data);
      res.status(201).json(transaction);
    } catch (error) {
      res.status(400).json({ error: "Invalid transaction data" });
    }
  });

  // Labor Entries
  app.get("/api/companies/:companyId/labor", async (req, res) => {
    try {
      const { projectId, startDate, endDate } = req.query;
      const entries = await storage.getLaborEntries(req.params.companyId, {
        projectId: projectId as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined
      });
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch labor entries" });
    }
  });

  app.post("/api/companies/:companyId/labor", async (req, res) => {
    try {
      const data = insertLaborEntrySchema.parse({ ...req.body, companyId: req.params.companyId });
      const entry = await storage.createLaborEntry(data);
      res.status(201).json(entry);
    } catch (error) {
      res.status(400).json({ error: "Invalid labor entry data" });
    }
  });

  // Dashboard
  app.get("/api/companies/:companyId/dashboard", async (req, res) => {
    try {
      const { weekStart, weekEnd } = req.query;
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ error: "weekStart and weekEnd are required" });
      }
      const dashboard = await storage.getCompanyDashboard(
        req.params.companyId,
        weekStart as string,
        weekEnd as string
      );
      res.json(dashboard);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });

  // Weekly Reports
  app.get("/api/companies/:companyId/reports", async (req, res) => {
    try {
      const reports = await storage.getWeeklyReports(req.params.companyId);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.get("/api/companies/:companyId/reports/week/:weekStart", async (req, res) => {
    try {
      const report = await storage.getWeeklyReportByWeek(req.params.companyId, req.params.weekStart);
      res.json(report || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.get("/api/reports/:id", async (req, res) => {
    try {
      const report = await storage.getWeeklyReport(req.params.id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.post("/api/companies/:companyId/reports/weekly", async (req, res) => {
    try {
      const { weekStart, weekEnd } = req.body;
      if (!weekStart || !weekEnd) {
        return res.status(400).json({ error: "weekStart and weekEnd are required" });
      }

      const dashboard = await storage.getCompanyDashboard(req.params.companyId, weekStart, weekEnd);
      
      const projectsObj: Record<string, { name: string; cost: number; revenue: number; margin: number }> = {};
      for (const p of dashboard.projects) {
        projectsObj[p.id] = { name: p.name, cost: p.cost, revenue: p.revenue, margin: p.margin };
      }

      const summary: ReportSummary = {
        totalCost: dashboard.totalCost,
        totalRevenue: dashboard.totalRevenue,
        grossMargin: dashboard.grossMargin,
        alerts: dashboard.alerts,
        projects: projectsObj,
        laborCost: dashboard.laborCost,
        materialCost: dashboard.materialCost,
        equipmentCost: dashboard.equipmentCost,
        otherCost: dashboard.totalCost - dashboard.laborCost - dashboard.materialCost - dashboard.equipmentCost
      };

      const report = await storage.createWeeklyReport({
        companyId: req.params.companyId,
        weekStart,
        weekEnd,
        summary
      });

      res.status(201).json(report);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // CSV Import
  app.post("/api/companies/:companyId/import", async (req, res) => {
    try {
      const { filename, rows, mapping } = req.body;
      if (!rows || !Array.isArray(rows)) {
        return res.status(400).json({ error: "rows array is required" });
      }

      const importFile = await storage.createImportFile({
        companyId: req.params.companyId,
        filename: filename || "upload.csv",
        source: "csv",
        status: "processing"
      });

      const importRowsData = rows.map((row: Record<string, unknown>) => ({
        importFileId: importFile.id,
        rawData: row,
        mapped: false
      }));
      await storage.createImportRows(importRowsData);

      const transactions = [];
      for (const row of rows) {
        const mappedRow: Record<string, string> = {};
        if (mapping) {
          for (const [csvCol, dbCol] of Object.entries(mapping)) {
            if (dbCol && row[csvCol] !== undefined) {
              mappedRow[dbCol as string] = String(row[csvCol]);
            }
          }
        } else {
          Object.assign(mappedRow, row);
        }

        if (mappedRow.amount && mappedRow.txnDate) {
          transactions.push({
            companyId: req.params.companyId,
            type: mappedRow.type || "expense",
            direction: mappedRow.direction || "out",
            amount: mappedRow.amount,
            txnDate: mappedRow.txnDate,
            category: mappedRow.category || null,
            description: mappedRow.description || null,
            vendor: mappedRow.vendor || null,
            memo: mappedRow.memo || null,
            projectId: mappedRow.projectId || null,
            source: "csv",
            sourceRef: importFile.id
          });
        }
      }

      const created = await storage.createTransactions(transactions);
      await storage.updateImportFileStatus(importFile.id, "completed");

      res.status(201).json({
        importFileId: importFile.id,
        rowsProcessed: rows.length,
        transactionsCreated: created.length
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to import data" });
    }
  });

  // Company Settings
  app.get("/api/settings", async (req, res) => {
    try {
      const { companyId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }
      const settings = await storage.getCompanySettings(companyId as string);
      if (!settings) {
        const defaultSettings = await storage.upsertCompanySettings(companyId as string, {});
        return res.json(defaultSettings);
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const { companyId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }
      const settingsSchema = insertCompanySettingsSchema
        .omit({ companyId: true })
        .partial()
        .strict()
        .refine(data => Object.keys(data).length > 0, { message: "At least one setting field is required" });
      const validatedData = settingsSchema.parse(req.body);
      const settings = await storage.upsertCompanySettings(companyId as string, validatedData);
      res.json(settings);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid settings data" });
      }
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // QuickBooks Integration
  app.get("/api/integrations/quickbooks/status", async (req, res) => {
    try {
      const { companyId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }
      const connection = await storage.getQbConnection(companyId as string);
      res.json({
        connected: connection?.connectionStatus === "connected",
        status: connection?.connectionStatus || "disconnected",
        lastSyncAt: connection?.lastSyncAt || null,
        realmId: connection?.realmId || null
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch QuickBooks status" });
    }
  });

  app.get("/api/integrations/quickbooks/connect", async (req, res) => {
    try {
      const { companyId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }
      const authUrl = `https://appcenter.intuit.com/connect/oauth2?client_id=DEMO_CLIENT_ID&redirect_uri=${encodeURIComponent(process.env.QB_REDIRECT_URI || 'http://localhost:5000/api/integrations/quickbooks/callback')}&response_type=code&scope=com.intuit.quickbooks.accounting&state=${companyId}`;
      res.json({ authUrl, message: "QuickBooks OAuth not configured - this is a placeholder URL" });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate auth URL" });
    }
  });

  app.get("/api/integrations/quickbooks/callback", async (req, res) => {
    try {
      const { code, state: companyId, realmId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "Invalid callback - missing state" });
      }
      await storage.upsertQbConnection(companyId as string, {
        realmId: realmId as string || null,
        connectionStatus: "connected",
        accessToken: "demo_access_token",
        refreshToken: "demo_refresh_token",
        tokenExpiresAt: new Date(Date.now() + 3600000)
      });
      res.redirect(`/?qb_connected=true`);
    } catch (error) {
      res.status(500).json({ error: "Failed to complete OAuth callback" });
    }
  });

  app.post("/api/integrations/quickbooks/disconnect", async (req, res) => {
    try {
      const { companyId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }
      await storage.deleteQbConnection(companyId as string);
      res.json({ success: true, message: "QuickBooks disconnected" });
    } catch (error) {
      res.status(500).json({ error: "Failed to disconnect QuickBooks" });
    }
  });

  app.post("/api/integrations/quickbooks/sync-now", async (req, res) => {
    try {
      const { companyId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }
      const connection = await storage.getQbConnection(companyId as string);
      if (!connection || connection.connectionStatus !== "connected") {
        return res.status(400).json({ error: "QuickBooks not connected" });
      }
      await storage.upsertQbConnection(companyId as string, {
        lastSyncAt: new Date()
      });
      res.json({ success: true, message: "Sync initiated (stub - no actual sync performed)", lastSyncAt: new Date() });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync with QuickBooks" });
    }
  });

  // Seed demo data
  app.post("/api/seed/demo", async (_req, res) => {
    try {
      const existingCompanies = await storage.getCompanies();
      if (existingCompanies.length > 0) {
        return res.json({ message: "Demo data already exists", companyId: existingCompanies[0].id });
      }

      const company = await storage.createCompany({
        name: "ABC Construction Co.",
        email: "info@abcconstruction.com",
        timezone: "America/New_York"
      });

      const project1 = await storage.createProject({
        companyId: company.id,
        name: "Downtown Office Renovation",
        status: "active",
        startDate: "2024-10-01",
        endDate: "2025-03-31"
      });

      const project2 = await storage.createProject({
        companyId: company.id,
        name: "Riverside Apartments",
        status: "active",
        startDate: "2024-11-15",
        endDate: "2025-06-30"
      });

      const project3 = await storage.createProject({
        companyId: company.id,
        name: "Highway Bridge Repair",
        status: "active",
        startDate: "2024-12-01",
        endDate: "2025-02-28"
      });

      const now = new Date();
      const weekDates = [];
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

      await storage.createTransactions(txnsToCreate);

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

      await storage.createLaborEntries(laborToCreate);

      res.status(201).json({
        message: "Demo data seeded successfully",
        companyId: company.id,
        projects: [project1.id, project2.id, project3.id]
      });
    } catch (error) {
      console.error("Seed error:", error);
      res.status(500).json({ error: "Failed to seed demo data" });
    }
  });

  return httpServer;
}
