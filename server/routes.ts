import type { Express } from "express";
import { type Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { parseS3Url, getS3ObjectText, putS3ObjectBuffer, listS3Objects } from "./s3";
import { parseEml, parseEmlWithAttachments } from "./emailParse";
import { textractSmartOCR, isSupportedFile, isPdfFile, isImageFile, getS3ObjectMetadata, debugS3File, TextractStillInProgressError } from "./textract";
import { parseOcrToStructured, isInvoiceLike, normalizeVendorName, extractVendorName } from "./ocrParse";
import { categorizeLineItem } from "./categorize";
import { getLlmConfig, getLlmClient } from "./llmClient";
import {
  normalizeInvoiceNumber,
  calculateReconciliationDelta,
  needsReconciliationReview,
  isUniqueViolationError,
  InvoiceNumberRequiredError,
  RECONCILIATION_THRESHOLD,
} from "./invoiceUtils";
import { parsePayrollExcel, type PayrollRow, type PayrollEntryInput } from "./payrollParser";

// Multer config for file uploads (15MB limit, memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: PDF, PNG, JPEG`));
    }
  },
});

// Multer config for Excel payroll uploads
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: Excel files (.xlsx, .xls)`));
    }
  },
});


import {
  insertCompanySchema,
  insertProjectSchema,
  insertTransactionSchema,
  insertWeeklyReportSchema,
  insertLaborEntrySchema,
  insertCompanySettingsSchema,
  type ReportSummary,
} from "@shared/schema";
import { requireAuth, optionalAuth, type AuthRequest } from "./auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ========== HEALTH CHECK (for load balancers/monitoring) ==========
  app.get("/api/health", async (_req, res) => {
    try {
      // Basic DB connectivity check
      const dbOk = await storage.healthCheck?.() ?? true;
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: dbOk ? "connected" : "error",
        version: process.env.npm_package_version || "1.0.0"
      });
    } catch (error) {
      res.status(503).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: "Service unavailable"
      });
    }
  });

  // ========== AUTH ROUTES ==========

  // Sync user with backend (called on every Firebase auth state change)
  app.post("/api/auth/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { firebaseUid, email, displayName, photoUrl } = req.body;

      // Check if user exists
      let user = await storage.getUserByFirebaseUid(firebaseUid);

      if (!user) {
        // Create new user
        user = await storage.createUser({
          firebaseUid,
          email,
          displayName,
          photoUrl,
        });
      } else {
        // Update last login
        await storage.updateUserLastLogin(user.id);
      }

      // Get user's companies
      const companies = await storage.getUserCompanies(user.id);

      res.json({ ok: true, user, companies });
    } catch (error: any) {
      console.error("[auth] Sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Signup - create user and company
  app.post("/api/auth/signup", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { firebaseUid, email, displayName, companyName } = req.body;

      // Check if user already exists
      let user = await storage.getUserByFirebaseUid(firebaseUid);

      if (user) {
        // User already exists, just return their companies
        const companies = await storage.getUserCompanies(user.id);
        return res.json({ ok: true, user, companies });
      }

      // Create new user
      user = await storage.createUser({
        firebaseUid,
        email,
        displayName,
      });

      // Create company with 14-day trial
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const company = await storage.createCompany({
        name: companyName,
        email,
      });

      // Update company with trial info
      await storage.updateCompanySubscription(company.id, {
        subscriptionStatus: "trialing",
        subscriptionPlan: "starter",
        trialEndsAt,
      });

      // Add user to company as owner
      await storage.addUserToCompany({
        userId: user.id,
        companyId: company.id,
        role: "owner",
      });

      // Get updated companies list
      const companies = await storage.getUserCompanies(user.id);

      res.status(201).json({ ok: true, user, companies });
    } catch (error: any) {
      console.error("[auth] Signup error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get current user info
  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUserByFirebaseUid(req.user!.uid);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const companies = await storage.getUserCompanies(user.id);

      res.json({ ok: true, user, companies });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== STRIPE ROUTES ==========
  app.post("/api/stripe/create-checkout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { companyId, plan } = req.body;
      const { createCheckoutSession, PLANS } = await import("./stripe");

      if (!PLANS[plan as keyof typeof PLANS]) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await createCheckoutSession(
        companyId,
        plan as keyof typeof PLANS,
        `${baseUrl}/settings?subscription=success`,
        `${baseUrl}/settings?subscription=canceled`
      );

      res.json({ ok: true, url: session.url });
    } catch (error: any) {
      console.error("[stripe] Checkout error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/stripe/billing-portal", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { companyId } = req.body;
      const { createBillingPortalSession } = await import("./stripe");

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await createBillingPortalSession(companyId, `${baseUrl}/settings`);

      res.json({ ok: true, url: session.url });
    } catch (error: any) {
      console.error("[stripe] Billing portal error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe webhook (no auth - uses signature verification)
  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      const { handleWebhook } = await import("./stripe");
      const signature = req.headers["stripe-signature"] as string;

      // Note: For webhooks, you need raw body - configure express accordingly
      const result = await handleWebhook(req.body, signature);
      res.json(result);
    } catch (error: any) {
      console.error("[stripe] Webhook error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get subscription status
  app.get("/api/companies/:companyId/subscription", requireAuth, async (req: AuthRequest, res) => {
    try {
      const company = await storage.getCompany(req.params.companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const { isSubscriptionActive, getTrialDaysRemaining, PLANS } = await import("./stripe");

      res.json({
        ok: true,
        status: company.subscriptionStatus,
        plan: company.subscriptionPlan,
        isActive: isSubscriptionActive(company.subscriptionStatus),
        trialDaysRemaining: getTrialDaysRemaining(company.trialEndsAt),
        plans: PLANS,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== TEAM MANAGEMENT ROUTES ==========

  // Get team members for a company
  app.get("/api/companies/:companyId/team", requireAuth, async (req: AuthRequest, res) => {
    try {
      const members = await storage.getCompanyUsers(req.params.companyId);
      res.json(members);
    } catch (error: any) {
      console.error("[team] Get members error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Invite team member
  app.post("/api/companies/:companyId/team/invite", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { email, role } = req.body;
      const companyId = req.params.companyId;

      // Validate role
      if (!["admin", "member"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'member'" });
      }

      // Check if user exists
      let user = await storage.getUserByEmail(email);

      if (!user) {
        // For now, create a placeholder user that will be activated when they sign up
        // In production, you'd send an email invite
        user = await storage.createUser({
          firebaseUid: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          email,
          displayName: null,
        });
      }

      // Check if user is already in company
      const existingMembers = await storage.getCompanyUsers(companyId);
      const alreadyMember = existingMembers.find((m) => m.userId === user!.id);
      if (alreadyMember) {
        return res.status(400).json({ error: "User is already a member of this company" });
      }

      // Add user to company
      const userCompany = await storage.addUserToCompany({
        userId: user.id,
        companyId,
        role,
      });

      // TODO: Send email invite

      res.json({ ok: true, member: { ...userCompany, user } });
    } catch (error: any) {
      console.error("[team] Invite error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Remove team member
  app.delete("/api/companies/:companyId/team/:memberId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { companyId, memberId } = req.params;

      // Get the member to check if they're the owner
      const members = await storage.getCompanyUsers(companyId);
      const member = members.find((m) => m.id === memberId);

      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (member.role === "owner") {
        return res.status(400).json({ error: "Cannot remove the owner from the company" });
      }

      await storage.removeUserFromCompany(memberId);

      res.json({ ok: true });
    } catch (error: any) {
      console.error("[team] Remove member error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update team member role
  app.patch("/api/companies/:companyId/team/:memberId/role", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { companyId, memberId } = req.params;
      const { role } = req.body;

      // Validate role
      if (!["admin", "member"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'member'" });
      }

      // Get the member to check if they're the owner
      const members = await storage.getCompanyUsers(companyId);
      const member = members.find((m) => m.id === memberId);

      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (member.role === "owner") {
        return res.status(400).json({ error: "Cannot change the owner's role" });
      }

      const updatedMember = await storage.updateUserCompanyRole(memberId, role);

      res.json({ ok: true, member: updatedMember });
    } catch (error: any) {
      console.error("[team] Update role error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========== ESTIMATES/PROPOSALS ROUTES ==========

  // List estimates for a company
  app.get("/api/companies/:companyId/estimates", async (req, res) => {
    try {
      const estimates = await storage.getEstimates(req.params.companyId);
      res.json({ ok: true, estimates });
    } catch (error: any) {
      console.error("[estimates] List error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single estimate with line items
  app.get("/api/estimates/:id", async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      const lineItems = await storage.getEstimateLineItems(estimate.id);
      let gc = null;
      if (estimate.gcId) {
        gc = await storage.getGeneralContractor(estimate.gcId);
      }
      res.json({ ok: true, estimate, lineItems, gc });
    } catch (error: any) {
      console.error("[estimates] Get error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create estimate
  app.post("/api/companies/:companyId/estimates", async (req, res) => {
    try {
      const estimate = await storage.createEstimate({
        ...req.body,
        companyId: req.params.companyId,
      });
      res.json({ ok: true, estimate });
    } catch (error: any) {
      console.error("[estimates] Create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update estimate
  app.patch("/api/estimates/:id", async (req, res) => {
    try {
      const estimate = await storage.updateEstimate(req.params.id, req.body);
      res.json({ ok: true, estimate });
    } catch (error: any) {
      console.error("[estimates] Update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete estimate
  app.delete("/api/estimates/:id", async (req, res) => {
    try {
      await storage.deleteEstimate(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[estimates] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add line item to estimate
  app.post("/api/estimates/:estimateId/line-items", async (req, res) => {
    try {
      const lineItem = await storage.createEstimateLineItem({
        ...req.body,
        estimateId: req.params.estimateId,
      });
      res.json({ ok: true, lineItem });
    } catch (error: any) {
      console.error("[estimates] Add line item error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update line item
  app.patch("/api/estimate-line-items/:id", async (req, res) => {
    try {
      const lineItem = await storage.updateEstimateLineItem(req.params.id, req.body);
      res.json({ ok: true, lineItem });
    } catch (error: any) {
      console.error("[estimates] Update line item error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete line item
  app.delete("/api/estimate-line-items/:id", async (req, res) => {
    try {
      await storage.deleteEstimateLineItem(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[estimates] Delete line item error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Convert estimate to project
  app.post("/api/estimates/:id/convert-to-project", async (req, res) => {
    try {
      const project = await storage.convertEstimateToProject(req.params.id);
      res.json({ ok: true, project });
    } catch (error: any) {
      console.error("[estimates] Convert to project error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send estimate via email
  app.post("/api/estimates/:id/send", async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      // TODO: Implement actual email sending
      // For now, just update the status
      await storage.updateEstimate(req.params.id, {
        status: "sent",
        sentAt: new Date(),
      });

      res.json({ ok: true, message: "Estimate marked as sent" });
    } catch (error: any) {
      console.error("[estimates] Send error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // LLM status endpoint - check if LLM is configured and available
  app.get("/api/ingestion/llm-status", async (_req, res) => {
    try {
      const config = getLlmConfig();
      return res.json({
        provider: config.provider,
        llmConfigured: config.configured,
        keyPresent: config.keyPresent,
        keyPrefix: config.keyPrefix, // First 6 chars only, safe to expose
        maxInputChars: config.maxInputChars,
        maxTokens: config.maxTokens,
        model: config.model,
      });
    } catch (error: any) {
      console.error("[llm-status] Error:", error?.message || error);
      return res.status(500).json({ error: "Failed to get LLM status" });
    }
  });

  app.post("/api/ingestion/jobs/:id/categorize-parsed", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const results = await storage.getIngestionResults(job.id);

    // ---- helpers to safely read result shapes ----
    const isParsedResult = (r: any) => {
      const ej = r?.extractedJson;
      return !!(ej && ej.parsed && typeof ej.parsed === "object" && Array.isArray(ej.parsed.lineItems));
    };

    const isCategorizedResultForParsed = (r: any, parsedId: string) => {
      const ej = r?.extractedJson;
      return !!(ej && ej.categorized && ej.sourceResultId === parsedId);
    };

    // 1) Find latest parsed result
    // storage.getIngestionResults often returns newest first, but we’ll be safe:
    const sorted = [...results].sort((a: any, b: any) => {
      const at = new Date(a.createdAt ?? a.created_at ?? 0).getTime();
      const bt = new Date(b.createdAt ?? b.created_at ?? 0).getTime();
      return bt - at;
    });

    const parsedResult = sorted.find(isParsedResult);
    if (!parsedResult) {
      return res.status(400).json({ message: "No parsed result found. Run parse-ocr first." });
    }

    const parsedId = String(parsedResult.id);
    const parsed = parsedResult.extractedJson.parsed;

    // 2) Idempotency: if categorized exists for this parsed result, return it
    const existingCategorized = sorted.find((r: any) => isCategorizedResultForParsed(r, parsedId));
    if (existingCategorized) {
      const categorized = existingCategorized.extractedJson.categorized;
      const summary: Record<string, number> = {};
      for (const li of categorized.lineItems ?? []) {
        const cat = li.category || "Unknown";
        summary[cat] = (summary[cat] || 0) + 1;
      }

      return res.json({
        ok: true,
        jobId: job.id,
        resultId: existingCategorized.id,
        sourceResultId: parsedId,
        categorizedCount: (categorized.lineItems ?? []).length,
        categoriesSummary: summary,
        reused: true,
      });
    }

    // 3) Build categorized payload
    const categorizedLineItems = (parsed.lineItems as any[]).map((li) => {
      const desc = String(li.description ?? "");
      const c = categorizeLineItem(desc);

      return {
        ...li,
        category: c.category,
        categoryConfidence: c.confidence,
        matchedKeyword: c.matchedKeyword ?? null,
      };
    });

    const categorized = {
      docType: parsed.docType ?? null,
      projectName: parsed.projectName ?? null,
      vendorOrClient: parsed.vendorOrClient ?? null,
      totals: parsed.totals ?? {},
      warnings: parsed.warnings ?? [],
      lineItems: categorizedLineItems,
    };

    const summary: Record<string, number> = {};
    for (const li of categorizedLineItems) {
      const cat = li.category || "Unknown";
      summary[cat] = (summary[cat] || 0) + 1;
    }

    // 4) Save new ingestion result
    const newResult = await storage.createIngestionResult({
      ingestionJobId: job.id,
      rawText: "",
      extractedJson: {
        categorized,
        sourceResultId: parsedId,
      } as any,
      confidenceScore: null,
      status: "pending",
    });

    // Safe status update (don’t fail job)
    await storage.updateIngestionJobStatus(job.id, "completed");

    return res.json({
      ok: true,
      jobId: job.id,
      resultId: newResult.id,
      sourceResultId: parsedId,
      categorizedCount: categorizedLineItems.length,
      categoriesSummary: summary,
    });
  } catch (err) {
    console.error("categorize-parsed error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ MVP PERSIST-LEDGER: Persist invoices AND line items
// Includes invoice gating + vendor normalization + review queue + line item categorization
app.post("/api/ingestion/jobs/:id/persist-ledger", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const jobId = String(req.params.id);
    const job = await storage.getIngestionJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const company = await storage.getCompany(job.companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const results = await storage.getIngestionResults(job.id);

    // Sort newest first
    const sorted = [...results].sort((a: any, b: any) => {
      const at = new Date(a.createdAt ?? a.created_at ?? 0).getTime();
      const bt = new Date(b.createdAt ?? b.created_at ?? 0).getTime();
      return bt - at;
    });

    const isCategorizedResult = (r: any) => {
      const ej = r?.extractedJson;
      return !!(ej && ej.categorized && Array.isArray(ej.categorized.lineItems));
    };

    // Prefer canonical pointer if present
    let categorizedResult: any | undefined;
    if ((job as any).finalCategorizedResultId) {
      categorizedResult = sorted.find(
        (r: any) => String(r.id) === String((job as any).finalCategorizedResultId) && isCategorizedResult(r)
      );
    }
    if (!categorizedResult) categorizedResult = sorted.find(isCategorizedResult);

    if (!categorizedResult) {
      return res.status(400).json({
        message: "No categorized result found. Run categorize-parsed first.",
      });
    }

    const categorized = categorizedResult.extractedJson?.categorized;
    if (!categorized) {
      return res.status(400).json({ message: "Categorized payload missing on result" });
    }

    // Get raw text for invoice gating check and enhanced extraction
    const ocrResult = sorted.find((r: any) => r.extractedJson?.ocr);
    const rawText = ocrResult?.rawText || job.extractedText || "";

    // ========== INVOICE GATING ==========
    const invoiceCheck = isInvoiceLike(categorized, rawText);
    if (!invoiceCheck.isInvoice) {
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: true,
        reviewReason: "not_invoice",
        reviewStatus: "pending",
      });
      await storage.updateIngestionJobStatus(job.id, "needs_review", invoiceCheck.reason);
      return res.status(400).json({
        ok: false,
        message: invoiceCheck.reason,
        jobId: job.id,
        categorizedResultId: categorizedResult.id,
        invoiceCheck,
        hint: "Document does not appear to be an invoice. Review manually to confirm.",
      });
    }

    // ========== ENHANCED TOTAL/VENDOR EXTRACTION ==========
    // Import and use enhanced extraction if available
    const { extractInvoiceData, selectInvoiceTotal, extractVendor } = await import("./invoiceExtract");

    // Use enhanced extraction for better totals
    const enhancedExtraction = extractInvoiceData(rawText);

    // Check for override total first (from review approval)
    const overrideTotal = (job as any).overrideTotal ? parseFloat((job as any).overrideTotal) : null;
    const possibleTotals = categorized?.totals?.possibleTotals;
    let invoiceTotal = overrideTotal;
    let totalConfidence = overrideTotal ? 1.0 : 0;

    if (!invoiceTotal) {
      // Use enhanced extraction if it has better confidence
      if (enhancedExtraction.totalConfidence > 0.7) {
        invoiceTotal = enhancedExtraction.total;
        totalConfidence = enhancedExtraction.totalConfidence;
      } else if (Array.isArray(possibleTotals) && possibleTotals.length > 0) {
        invoiceTotal = Number(possibleTotals[0]);
        totalConfidence = 0.6;
      }
    }

    if (!invoiceTotal || Number.isNaN(invoiceTotal) || invoiceTotal <= 0) {
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: true,
        reviewReason: "missing_total",
        reviewStatus: "pending",
      });
      await storage.updateIngestionJobStatus(job.id, "needs_review", "No invoice total found");
      return res.status(400).json({
        ok: false,
        message: "No invoice total found. Cannot persist ledger safely.",
        jobId: job.id,
        categorizedResultId: categorizedResult.id,
        hint: "Use the review endpoint to provide an override total.",
      });
    }

    // Check for weak total signal
    const hasWeakTotal = totalConfidence < 0.7 || (categorized.warnings ?? []).some((w: string) =>
      w.includes("using standalone numbers as fallback") || w.includes("Only subtotals found")
    );
    if (hasWeakTotal && !overrideTotal) {
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: true,
        reviewReason: "weak_total_signal",
        reviewStatus: "pending",
      });
      console.log(`[persist-ledger] Job ${job.id} has weak total signal (confidence=${totalConfidence}), marked for review`);
    }

    // ========== VENDOR DETECTION ==========
    const overrideVendorName = (job as any).overrideVendorName;
    let vendorName = overrideVendorName || null;
    let vendorConfidence = overrideVendorName ? 1.0 : 0;

    if (!vendorName) {
      // Try enhanced extraction first
      if (enhancedExtraction.vendorConfidence > 0.6) {
        vendorName = enhancedExtraction.vendor;
        vendorConfidence = enhancedExtraction.vendorConfidence;
      } else if (categorized.vendorOrClient) {
        vendorName = categorized.vendorOrClient;
        vendorConfidence = 0.5;
      }
    }

    // Mark for review if vendor missing (but don't block)
    if (!vendorName) {
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: true,
        reviewReason: "missing_vendor",
        reviewStatus: "pending",
      });
      console.log(`[persist-ledger] Job ${job.id} missing vendor, marked for review`);
    }

    // Find or create vendor using normalized name
    let vendorId: string | null = null;
    if (vendorName) {
      const vendor = await storage.findOrCreateVendor(company.id, vendorName);
      vendorId = vendor.id;
    }

    // ========== PROJECT RESOLUTION ==========
    const findOrCreateProject = async (
      projectName?: string | null,
      customerPo?: string | null,
      jobName?: string | null
    ): Promise<string | null> => {
      // Try to match by external ref first (PO or job name)
      const externalRef = customerPo || jobName;
      if (externalRef) {
        const existing = await storage.findProjectByExternalRef(company.id, externalRef);
        if (existing) return existing.id;
      }

      // Then try by name
      const name = String(projectName ?? "").trim();
      if (name) {
        const list = await storage.getProjects(company.id);
        const normalizeKey = (s: string) => s.toLowerCase().trim();
        const existing = list.find((p: any) => normalizeKey(p.name) === normalizeKey(name));
        if (existing) return existing.id;

        // Create new project with external ref
        const created = await storage.createProject({
          companyId: company.id,
          name,
          externalRef: externalRef || null,
          status: "active",
        } as any);

        return created.id;
      }

      return null;
    };

    const projectId = await findOrCreateProject(
      categorized.projectName,
      enhancedExtraction.customerPo,
      enhancedExtraction.jobName
    );

    // Invoice date (from extraction or job created date)
    const invoiceDate = enhancedExtraction.invoiceDate ||
      (job.createdAt ? new Date(job.createdAt as any).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

    // ========== IDEMPOTENT PERSIST - DELETE EXISTING ==========
    // Delete any existing invoice for this job (idempotent re-run)
    const existingInvoice = await storage.getInvoiceBySourceJob(job.id);
    if (existingInvoice) {
      // Note: Line items cascade delete with invoice
      console.log(`[persist-ledger] Deleting existing invoice ${existingInvoice.id} for re-run`);
    }

    // Also clean up old transaction
    const deletedTxnCount = await storage.deleteTransactionsBySourceRef({
      companyId: company.id,
      source: "ingestion",
      sourceRef: job.id,
    });

    // ========== CREATE INVOICE ==========
    // Normalize invoice number for dedupe
    const rawInvoiceNumber = enhancedExtraction.invoiceNumber || "";
    const invoiceNumberNorm = normalizeInvoiceNumber(rawInvoiceNumber);

    // Calculate reconciliation delta
    const subtotalNum = enhancedExtraction.subtotal ?? null;
    const taxNum = enhancedExtraction.tax ?? null;
    const shippingNum = enhancedExtraction.shipping ?? null;
    const reconciliationDelta = calculateReconciliationDelta(subtotalNum, taxNum, shippingNum, invoiceTotal);
    const invoiceStatus = needsReconciliationReview(reconciliationDelta) ? "needs_review" : "parsed_ok";

    const invoice = await storage.createInvoice({
      companyId: company.id,
      projectId,
      vendorId,
      vendor: vendorName,
      invoiceNumber: rawInvoiceNumber,
      invoiceNumberNorm, // Normalized for dedupe
      invoiceDate,
      dueDate: enhancedExtraction.dueDate,
      customerPo: enhancedExtraction.customerPo,
      jobName: enhancedExtraction.jobName,
      subtotal: enhancedExtraction.subtotal?.toFixed(2) || null,
      tax: enhancedExtraction.tax?.toFixed(2) || null,
      shipping: enhancedExtraction.shipping?.toFixed(2) || null,
      total: invoiceTotal.toFixed(2),
      totalConfidence: totalConfidence.toFixed(2),
      vendorConfidence: vendorConfidence.toFixed(2),
      extractionMethod: "deterministic",
      reconciliationDelta: reconciliationDelta?.toFixed(2) || null,
      status: invoiceStatus,
      sourceJobId: job.id,
      sourceRef: job.fileUrl || null,
    } as any);

    console.log(`[persist-ledger] Created invoice ${invoice.id} for job ${job.id}`);

    // ========== CREATE LINE ITEMS ==========
    const lineItems = categorized.lineItems || [];
    let createdLineItems: any[] = [];

    if (lineItems.length > 0) {
      // Helper to safely convert to number
      const toNumber = (val: any): number | null => {
        if (val === null || val === undefined) return null;
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const cleaned = val.replace(/[$,\s]/g, "").trim();
          const num = parseFloat(cleaned);
          return isNaN(num) ? null : num;
        }
        return null;
      };

      const lineItemInserts = lineItems.map((li: any) => {
        // Normalize lineAmount (accept both lineAmount and amount)
        let lineAmount = toNumber(li.lineAmount) ?? toNumber(li.amount);
        // Compute from qty*price if needed
        if (lineAmount === null) {
          const qty = toNumber(li.quantity);
          const price = toNumber(li.unitPrice);
          if (qty !== null && price !== null) lineAmount = qty * price;
        }

        return {
          invoiceId: invoice.id,
          companyId: company.id,
          productCode: li.productCode || null,
          description: li.description || "Unknown item",
          quantity: toNumber(li.quantity)?.toString() || null,
          unit: li.unit || null,
          unitPrice: toNumber(li.unitPrice)?.toString() || null,
          lineAmount: lineAmount?.toFixed(2) || null,
          category: li.category || "misc",
          categoryConfidence: toNumber(li.categoryConfidence)?.toFixed(2) || "0.30",
          categoryReason: li.matchedKeyword ? `keyword: ${li.matchedKeyword}` : "no_match",
          rawLine: li.rawLine || null,
        };
      });

      createdLineItems = await storage.createInvoiceLineItems(lineItemInserts as any[]);
      console.log(`[persist-ledger] Created ${createdLineItems.length} line items for invoice ${invoice.id}`);
    }

    // ========== ALSO CREATE LEGACY TRANSACTION (backward compatibility) ==========
    const docType = String(categorized.docType ?? "");
    const topCategory =
      docType.includes("payroll") ? "labor" :
      docType.includes("equipment") ? "equipment" :
      "material";

    const createdTxn = await storage.createTransaction({
      companyId: company.id,
      projectId,
      vendorId,
      type: "expense",
      direction: "out",
      amount: invoiceTotal.toFixed(2),
      currency: "USD",
      txnDate: invoiceDate,
      category: topCategory,
      description: `Invoice ${enhancedExtraction.invoiceNumber || "total"} - ${vendorName ?? "Unknown vendor"}`,
      memo: JSON.stringify({
        invoiceId: invoice.id,
        ingestionJobId: job.id,
        lineItemCount: createdLineItems.length,
      }),
      vendor: vendorName || null,
      source: "ingestion",
      sourceRef: job.id,
    } as any);

    // Save canonical pointers
    await storage.updateIngestionJobFinalResults(job.id, {
      finalCategorizedResultId: String(categorizedResult.id),
      finalParsedResultId: categorizedResult.extractedJson?.sourceResultId
        ? String(categorizedResult.extractedJson.sourceResultId)
        : null,
    });

    // Clear needs_review if we successfully persisted (unless weak signals)
    if (!hasWeakTotal && vendorName) {
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: false,
        reviewStatus: "approved",
        reviewedAt: new Date(),
      });
    }

    await storage.updateIngestionJobStatus(job.id, "completed");

    return res.json({
      ok: true,
      jobId: job.id,
      deletedPrevious: deletedTxnCount,
      categorizedResultId: categorizedResult.id,
      invoiceCheck,
      invoice: {
        id: invoice.id,
        total: invoice.total,
        totalConfidence,
        vendor: vendorName,
        vendorConfidence,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        projectId: invoice.projectId,
        lineItemCount: createdLineItems.length,
      },
      transaction: {
        id: createdTxn.id,
        amount: createdTxn.amount,
        category: createdTxn.category,
        txnDate: createdTxn.txnDate,
        vendorId: createdTxn.vendorId,
        vendorName: vendorName,
        projectId: createdTxn.projectId,
      },
      lineItemCategories: createdLineItems.reduce((acc: Record<string, number>, li: any) => {
        const cat = li.category || "misc";
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {}),
      note: "MVP: Persisted invoice header + line items + legacy transaction.",
    });
  } catch (err: any) {
    console.error("persist-ledger error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err?.message || "Unknown error",
    });
  }
});



app.post("/api/ingestion/jobs/:id/extract-attachments", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.fileUrl) {
      await storage.updateIngestionJobStatus(job.id, "failed", "Missing fileUrl on ingestion job");
      return res.status(400).json({ message: "Job missing fileUrl" });
    }

    // 1) Download raw .eml from S3
    const { bucket, key } = parseS3Url(job.fileUrl);
    const rawEml = await getS3ObjectText(bucket, key);

    // 2) Parse with enhanced attachment extraction (inline, forwarded, nested)
    const parsed = await parseEmlWithAttachments(rawEml);

    // Defensive: attachments may still be missing depending on parser edge cases
    const attachments = parsed?.attachments ?? [];

    // Enhanced metadata including inline/forwarded counts and links
    const meta = {
      subject: parsed.subject,
      from: parsed.from,
      to: parsed.to,
      date: parsed.date,
      hasHtml: parsed.hasHtml,
      attachmentsCount: parsed.attachmentsCount,
      attachmentNames: parsed.attachmentNames,
      inlineCount: parsed.inlineCount || 0,
      forwardedCount: parsed.forwardedCount || 0,
      linksFoundCount: parsed.links?.length || 0,
      links: parsed.links || [],
    };

    // 3) No attachments? Mark needs_review with proper review fields
    if (attachments.length === 0) {
      // Build helpful note based on what we found
      let note = "No PDF/image attachments found";
      if (meta.linksFoundCount > 0) {
        note += `. Found ${meta.linksFoundCount} potential invoice link(s) in email body`;
      }
      if (meta.forwardedCount > 0) {
        note += `. Email contained ${meta.forwardedCount} forwarded message(s) but no processable attachments`;
      }

      const result = await storage.createIngestionResult({
        ingestionJobId: job.id,
        rawText: parsed.text || "",
        extractedJson: {
          meta,
          attachments: [],
          note,
        } as any,
        confidenceScore: null,
        status: "pending",
      });

      // Set proper review queue fields
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: true,
        reviewReason: "no_attachments",
        reviewStatus: "pending",
        reviewedAt: null,
      });
      await storage.updateIngestionJobStatus(job.id, "needs_review", note);

      return res.json({
        ok: true,
        jobId: job.id,
        resultId: result.id,
        uploadedCount: 0,
        attachments: [],
        note,
        meta,
        needsReview: true,
        reviewReason: "no_attachments",
      });
    }

    // 4) Upload attachments back to S3 with consistent path structure
    const uploaded: Array<{
      filename: string;
      contentType: string;
      size: number;
      s3Url: string;
      source?: string;
    }> = [];

    // Consistent prefix: attachments/{jobId}/{timestamp}/{filename}
    const timestamp = Date.now();
    const prefix = `attachments/${job.id}/${timestamp}`;

    for (const att of attachments) {
      const safeName = (att.filename && String(att.filename).trim()) ? String(att.filename).trim() : "attachment.bin";
      const contentType = att.contentType || "application/octet-stream";

      // Sanitize filename for S3 key (remove path separators, special chars)
      const normalizedName = safeName
        .replace(/[\/\\]/g, "_")
        .replace(/[^\w.\-()+\s]/g, "_")
        .slice(0, 180);

      // Use slash separator for cleaner S3 paths
      const outKey = `${prefix}/${normalizedName}`;

      const s3Url = await putS3ObjectBuffer({
        bucket,
        key: outKey,
        body: att.content,
        contentType,
      });

      uploaded.push({
        filename: normalizedName,
        contentType,
        size: typeof att.size === "number" ? att.size : (att.content?.length ?? 0),
        s3Url,
        source: att.source || "direct",
      });
    }

    // 5) Save result record (don't mark completed yet - OCR still needed)
    const result = await storage.createIngestionResult({
      ingestionJobId: job.id,
      rawText: parsed.text || "",
      extractedJson: {
        meta,
        attachments: uploaded,
      } as any,
      confidenceScore: null,
      status: "pending",
    });

    // Note: Don't mark job completed here - wait for OCR/parse/persist pipeline
    // await storage.updateIngestionJobStatus(job.id, "completed");

    return res.json({
      ok: true,
      jobId: job.id,
      resultId: result.id,
      uploadedCount: uploaded.length,
      attachments: uploaded,
      meta,
    });
  } catch (err: any) {
    console.error("extract-attachments error:", err);
    return res.status(500).json({ message: "Server error", error: err?.message });
  }
});

// ✅ OCR attachments - supports images (sync) and PDFs (async)
app.post("/api/ingestion/jobs/:id/ocr-attachments", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Find the latest ingestion result with attachments
    const results = await storage.getIngestionResults(job.id);
    const resultWithAttachments = results.find(
      (r) => r.extractedJson && (r.extractedJson as any).attachments?.length > 0
    );

    if (!resultWithAttachments) {
      return res.status(400).json({
        message: "No ingestion result with attachments found. Run extract-attachments first.",
      });
    }

    const sourceResultId = resultWithAttachments.id;
    const attachments = (resultWithAttachments.extractedJson as any).attachments as Array<{
      filename: string;
      contentType: string;
      size: number;
      s3Url: string;
    }>;

    if (!attachments || attachments.length === 0) {
      return res.status(400).json({ message: "No attachments found in result" });
    }

    // Process each attachment with enhanced metadata
    type OcrResultItem = {
      filename: string;
      s3Url: string;
      contentType?: string;
      bytes?: number;
      text: string;
      textLength?: number;
      textSource?: "pdf_embedded" | "ocr";
      pages?: number;
      confidence?: number | null;
      lineCount?: number;
      method?: "detect" | "textract-async" | "pdf_text";
      textractJobId?: string;
      error?: string;
      skipped?: boolean;
      skipReason?: string;
      stillInProgress?: boolean;
    };

    const ocrResults: OcrResultItem[] = [];
    const allTextParts: string[] = [];

    let pdfCount = 0;
    let imageCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let successCount = 0;

    for (const att of attachments) {
      const { filename, contentType, s3Url, size } = att;

      // Check if file type is supported
      if (!isSupportedFile(filename, contentType)) {
        ocrResults.push({
          filename,
          s3Url,
          contentType,
          bytes: size,
          text: "",
          textLength: 0,
          skipped: true,
          skipReason: `Unsupported file type: ${contentType || "unknown"}`,
        });
        skippedCount++;
        continue;
      }

      // Count file types
      if (isPdfFile(filename, contentType)) {
        pdfCount++;
      } else if (isImageFile(filename, contentType)) {
        imageCount++;
      }

      // Run OCR (with PDF text extraction first for PDFs)
      try {
        const { bucket, key } = parseS3Url(s3Url);
        const result = await textractSmartOCR(bucket, key, contentType);

        ocrResults.push({
          filename,
          s3Url,
          contentType,
          bytes: size,
          text: result.text,
          textLength: result.text.length,
          textSource: result.textSource,
          pages: result.pageCount,
          confidence: result.confidence,
          lineCount: result.lineCount,
          method: result.method,
          textractJobId: result.textractJobId,
        });

        if (result.text) {
          allTextParts.push(`--- ${filename} ---\n${result.text}`);
          successCount++;
        } else {
          // OCR succeeded but no text found
          successCount++;
        }
      } catch (err: any) {
        // Handle TextractStillInProgressError specially - job may complete later
        if (err instanceof TextractStillInProgressError) {
          console.warn(`OCR still in progress for ${filename}: ${err.message}`);
          ocrResults.push({
            filename,
            s3Url,
            contentType,
            bytes: size,
            text: "",
            textLength: 0,
            error: `TEXTRACT_IN_PROGRESS: ${err.message}`,
            textractJobId: err.jobId,
            stillInProgress: true,
          });
          errorCount++;
        } else {
          console.error(`OCR error for ${filename}:`, err);
          ocrResults.push({
            filename,
            s3Url,
            contentType,
            bytes: size,
            text: "",
            textLength: 0,
            error: err?.message || "Textract failed",
          });
          errorCount++;
        }
      }
    }

    const combinedText = allTextParts.join("\n\n").trim();

    // Check if any OCR jobs are still in progress
    const stillInProgress = ocrResults.some((r: any) => r.stillInProgress);

    // Create new ingestion result with OCR data
    const ocrResult = await storage.createIngestionResult({
      ingestionJobId: job.id,
      rawText: combinedText || "",
      extractedJson: {
        attachments,
        ocr: ocrResults,
        stillInProgress,
        sourceResultId,
        combinedText: combinedText || "",
      } as any,
      confidenceScore: null,
      status: "pending",
    });

    // Update job status based on OCR results
    if (combinedText) {
      await storage.updateIngestionJobExtractedText(job.id, combinedText.slice(0, 50000));
      // Don't mark completed yet - still need parse/categorize/persist
      // await storage.updateIngestionJobStatus(job.id, "completed");
    } else if (stillInProgress) {
      // Textract jobs still in progress - keep job queued for retry, NOT marked as empty
      await storage.updateIngestionJobStatus(
        job.id,
        "processing",
        "Textract OCR still in progress - retry later"
      );
    } else {
      // No usable text and no jobs in progress - mark for review
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: true,
        reviewReason: "ocr_empty",
        reviewStatus: "pending",
        reviewedAt: null,
      });
      await storage.updateIngestionJobStatus(
        job.id,
        "needs_review",
        "OCR returned no usable text from attachments"
      );
    }

    return res.json({
      ok: true,
      jobId: job.id,
      resultId: ocrResult.id,
      sourceResultId,
      ocrCount: attachments.length,
      successCount,
      pdfCount,
      imageCount,
      skippedCount,
      errorCount,
      ocr: ocrResults,
      textPreview: combinedText.slice(0, 500),
    });
  } catch (err: any) {
    console.error("ocr-attachments error:", err);

    const name = err?.name || err?.Code;
    if (name === "InvalidS3ObjectException") {
      return res.status(400).json({ message: "Invalid S3 object for Textract", detail: err?.message });
    }
    if (name === "UnsupportedDocumentException") {
      return res.status(400).json({ message: "Unsupported document type for Textract", detail: err?.message });
    }
    if (name === "AccessDeniedException") {
      return res.status(403).json({ message: "Textract access denied - check IAM permissions" });
    }
    if (name === "InvalidParameterException") {
      return res.status(400).json({ message: "Invalid Textract parameter", detail: err?.message });
    }
    if (name === "PermanentRedirect") {
      return res.status(400).json({
        message: "S3 bucket region mismatch - ensure AWS_REGION matches bucket region",
        detail: err?.Endpoint,
      });
    }

    return res.status(500).json({ message: "Server error", error: err?.message });
  }
});

// ✅ Parse OCR text into structured data (idempotent for same sourceResultId)
app.post("/api/ingestion/jobs/:id/parse-ocr", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Get all results for this job
    const results = await storage.getIngestionResults(job.id);

    // Find the most recent result with extractedJson.ocr array
    // Sort by createdAt descending if available, otherwise take last matching
    const resultsWithOcr = results.filter(
      (r) => r.extractedJson && Array.isArray((r.extractedJson as any).ocr) && (r.extractedJson as any).ocr.length > 0
    );

    if (resultsWithOcr.length === 0) {
      return res.status(400).json({
        message: "No ingestion result with OCR data found. Run ocr-attachments first.",
      });
    }

    // Sort by createdAt descending to get most recent
    resultsWithOcr.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return 0;
    });

    const ocrResult = resultsWithOcr[0];
    const sourceResultId = ocrResult.id;

    // ✅ IDEMPOTENCY: Check if we already parsed this OCR result
    const existingParsed = results.find((r) => {
      const ej = r.extractedJson as any;
      return ej && ej.sourceResultId === sourceResultId && ej.parsed;
    });

    if (existingParsed) {
      const parsed = (existingParsed.extractedJson as any).parsed;
      console.log(`parse-ocr: reusing existing result ${existingParsed.id} for sourceResultId ${sourceResultId}`);
      return res.json({
        ok: true,
        jobId: job.id,
        resultId: existingParsed.id,
        sourceResultId,
        lineItemCount: parsed.lineItems?.length ?? 0,
        docType: parsed.docType,
        warnings: parsed.warnings ?? [],
        reused: true,
      });
    }

    const ocrArray = (ocrResult.extractedJson as any).ocr as Array<{
      filename: string;
      text: string;
    }>;

    // Build combined text from all OCR items (extract only actual text, not headers)
    const ocrTextParts = ocrArray
      .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
      .filter(Boolean);
    const ocrText = ocrTextParts.join("\n\n");

    // ✅ GUARD RAIL: Reject empty OCR text before creating parsed result
    if (!ocrText.trim()) {
      return res.status(400).json({
        message: "OCR result has no text. Re-run ocr-attachments or check Textract output.",
        ocrResultId: ocrResult.id,
      });
    }

    // Build combined text with headers for parsing context
    const combinedText = ocrArray
      .map((item) => `--- ${item.filename} ---\n${item.text || ""}`)
      .join("\n\n");

    // Parse the OCR text into structured data
    const parsed = parseOcrToStructured(combinedText);

    // Create new ingestion result with parsed data
    const parseResult = await storage.createIngestionResult({
      ingestionJobId: job.id,
      rawText: combinedText,
      extractedJson: {
        sourceResultId,
        parsed,
      } as any,
      confidenceScore: null,
      status: "pending",
    });

    // Update job status based on parsed results
    if (parsed.lineItems.length > 0) {
      await storage.updateIngestionJobStatus(job.id, "completed");
    } else {
      await storage.updateIngestionJobStatus(job.id, "needs_review", "No line items parsed from OCR");
    }

    return res.json({
      ok: true,
      jobId: job.id,
      resultId: parseResult.id,
      sourceResultId,
      lineItemCount: parsed.lineItems.length,
      docType: parsed.docType,
      warnings: parsed.warnings,
      textPreview: combinedText.slice(0, 500),
    });
  } catch (err: any) {
    console.error("parse-ocr error:", err);
    return res.status(500).json({ message: "Server error", error: err?.message });
  }
});

// ✅ Run full MVP pipeline: process-from-s3 → extract-attachments → ocr-attachments → parse-ocr
app.post("/api/ingestion/jobs/:id/run-mvp", async (req, res) => {
  const steps: Record<string, { status: string; resultId?: string; reused?: boolean; error?: string }> = {};

  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.fileUrl) {
      await storage.updateIngestionJobStatus(job.id, "failed", "Missing fileUrl on ingestion job");
      return res.status(400).json({ message: "Job missing fileUrl" });
    }

    console.log(`run-mvp: starting pipeline for job ${job.id}`);

    // Fetch all results once
    let results = await storage.getIngestionResults(job.id);

    // Helper to sort by createdAt descending
    const sortByCreatedAtDesc = <T extends { createdAt?: Date | string | null }>(arr: T[]): T[] => {
      return [...arr].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return 0;
      });
    };

    // ========== STRICT PREDICATES ==========
    // ATT_RESULT: has attachments array with s3Url, NO ocr array, NO parsed object
    const isAttachmentResult = (r: typeof results[0]): boolean => {
      const ej = r.extractedJson as any;
      if (!ej) return false;
      if (!Array.isArray(ej.attachments) || ej.attachments.length === 0) return false;
      if (!ej.attachments[0]?.s3Url) return false;
      // STRICT: must NOT have ocr or parsed (those are downstream results)
      if (Array.isArray(ej.ocr)) return false;
      if (ej.parsed) return false;
      return true;
    };

    // OCR_RESULT: has ocr array, has sourceResultId matching attResultId, NO parsed object
    const isOcrResult = (r: typeof results[0], attResultId: string): boolean => {
      const ej = r.extractedJson as any;
      if (!ej) return false;
      if (!Array.isArray(ej.ocr) || ej.ocr.length === 0) return false;
      if (ej.sourceResultId !== attResultId) return false;
      // STRICT: must NOT have parsed
      if (ej.parsed) return false;
      return true;
    };

    // PARSED_RESULT: has parsed object, has sourceResultId matching ocrResultId
    const isParsedResult = (r: typeof results[0], ocrResultId: string): boolean => {
      const ej = r.extractedJson as any;
      if (!ej) return false;
      if (!ej.parsed) return false;
      if (ej.sourceResultId !== ocrResultId) return false;
      return true;
    };

    // ========== OCR TEXT HELPERS ==========
    // Extract combined OCR text from a result
    const getOcrCombinedText = (result: any): string => {
      const ocrArr = result?.extractedJson?.ocr;
      if (!Array.isArray(ocrArr)) return "";
      const parts = ocrArr
        .map((o: any) => (typeof o?.text === "string" ? o.text.trim() : ""))
        .filter(Boolean);
      return parts.join("\n\n");
    };

    // Check if OCR result has usable (non-empty) text
    const hasUsableOcrText = (result: any): boolean => {
      return getOcrCombinedText(result).trim().length > 0;
    };

    // ========== STEP 1: extract-attachments ==========
    let attResult: typeof results[0] | undefined;
    {
      const candidates = sortByCreatedAtDesc(results.filter(isAttachmentResult));
      attResult = candidates[0];

      if (attResult) {
        console.log(`run-mvp: reusing ATT_RESULT ${attResult.id}`);
        steps["extract-attachments"] = { status: "ok", resultId: attResult.id, reused: true };
      } else {
        console.log(`run-mvp: running extract-attachments`);

        const { bucket, key } = parseS3Url(job.fileUrl);
        const rawEml = await getS3ObjectText(bucket, key);
        const parsed = await parseEmlWithAttachments(rawEml);
        const attachments = parsed?.attachments ?? [];

        const meta = {
          subject: parsed.subject,
          from: parsed.from,
          to: parsed.to,
          date: parsed.date,
          hasHtml: parsed.hasHtml,
          attachmentsCount: parsed.attachmentsCount,
          attachmentNames: parsed.attachmentNames,
        };

        if (attachments.length === 0) {
          const result = await storage.createIngestionResult({
            ingestionJobId: job.id,
            rawText: parsed.text || "",
            extractedJson: { meta, attachments: [], note: "No attachments found" } as any,
            confidenceScore: null,
            status: "pending",
          });
          await storage.updateIngestionJobStatus(job.id, "needs_review", "No attachments found in email");
          steps["extract-attachments"] = { status: "ok", resultId: result.id, error: "No attachments found" };
          return res.json({
            ok: true,
            jobId: job.id,
            steps,
            final: null,
            message: "Pipeline stopped: no attachments found",
          });
        }

        // Upload attachments to S3
        const uploaded: Array<{ filename: string; contentType: string; size: number; s3Url: string }> = [];
        const prefix = `attachments/${job.id}/${Date.now()}`;

        for (const att of attachments) {
          const safeName = (att.filename && String(att.filename).trim()) ? String(att.filename).trim() : "attachment.bin";
          const contentType = att.contentType || "application/octet-stream";
          const normalizedName = safeName.replace(/[\/\\]/g, "_");
          const outKey = `${prefix}-${normalizedName}`;

          const s3Url = await putS3ObjectBuffer({
            bucket,
            key: outKey,
            body: att.content,
            contentType,
          });

          uploaded.push({
            filename: normalizedName,
            contentType,
            size: typeof att.size === "number" ? att.size : (att.content?.length ?? 0),
            s3Url,
          });
        }

        const result = await storage.createIngestionResult({
          ingestionJobId: job.id,
          rawText: parsed.text || "",
          extractedJson: { meta, attachments: uploaded } as any,
          confidenceScore: null,
          status: "pending",
        });

        attResult = result;
        results.push(result); // Add to local cache
        steps["extract-attachments"] = { status: "ok", resultId: result.id };
      }
    }

    // ========== STEP 2: ocr-attachments ==========
    let ocrResult: typeof results[0] | undefined;
    {
      // Find OCR candidates for this attachment result
      const ocrCandidates = sortByCreatedAtDesc(results.filter((r) => isOcrResult(r, attResult!.id)));

      // PREFER OCR results that have usable (non-empty) text
      ocrResult = ocrCandidates.find((r) => hasUsableOcrText(r));

      // If we found candidates but none have usable text, log and force re-run
      if (!ocrResult && ocrCandidates.length > 0) {
        console.log(`run-mvp: found ${ocrCandidates.length} OCR result(s) but none have usable text, will re-run OCR`);
      }

      if (ocrResult) {
        console.log(`run-mvp: reusing OCR_RESULT ${ocrResult.id} with usable text (sourceResultId=${attResult!.id})`);
        steps["ocr-attachments"] = { status: "ok", resultId: ocrResult.id, reused: true };
      } else {
        console.log(`run-mvp: running ocr-attachments for ATT_RESULT ${attResult!.id}`);

        const attachments = (attResult!.extractedJson as any).attachments as Array<{
          filename: string;
          contentType: string;
          size: number;
          s3Url: string;
        }>;

        type OcrResultItem = {
          filename: string;
          s3Url: string;
          text: string;
          pages?: number;
          confidence?: number | null;
          lineCount?: number;
          method?: "detect" | "textract-async" | "pdf_text";
          textractJobId?: string;
          error?: string;
          skipped?: boolean;
          skipReason?: string;
        };

        const ocrResults: OcrResultItem[] = [];
        const allTextParts: string[] = [];

        for (const att of attachments) {
          const { filename, contentType, s3Url } = att;

          if (!isSupportedFile(filename, contentType)) {
            ocrResults.push({
              filename,
              s3Url,
              text: "",
              skipped: true,
              skipReason: `Unsupported file type: ${contentType || "unknown"}`,
            });
            continue;
          }

          try {
            const { bucket, key } = parseS3Url(s3Url);
            const result = await textractSmartOCR(bucket, key, contentType);

            ocrResults.push({
              filename,
              s3Url,
              text: result.text,
              pages: result.pageCount,
              confidence: result.confidence,
              lineCount: result.lineCount,
              method: result.method,
              textractJobId: result.textractJobId,
            });

            if (result.text) {
              allTextParts.push(`--- ${filename} ---\n${result.text}`);
            }
          } catch (err: any) {
            console.error(`run-mvp OCR error for ${filename}:`, err);
            ocrResults.push({
              filename,
              s3Url,
              text: "",
              error: err?.message || "Textract failed",
            });
          }
        }

        const combinedText = allTextParts.join("\n\n").trim();

        const result = await storage.createIngestionResult({
          ingestionJobId: job.id,
          rawText: combinedText || "",
          extractedJson: {
            attachments,
            ocr: ocrResults,
            sourceResultId: attResult!.id,
            combinedText: combinedText || "",
          } as any,
          confidenceScore: null,
          status: "pending",
        });

        if (combinedText) {
          await storage.updateIngestionJobExtractedText(job.id, combinedText.slice(0, 50000));
        }

        ocrResult = result;
        results.push(result); // Add to local cache
        steps["ocr-attachments"] = { status: "ok", resultId: result.id };
      }
    }

    // ========== STEP 3: parse-ocr ==========
    let parsedResult: typeof results[0] | undefined;
    {
      const candidates = sortByCreatedAtDesc(results.filter((r) => isParsedResult(r, ocrResult!.id)));
      parsedResult = candidates[0];

      let finalResult: { resultId: string; lineItemCount: number; docType: string };

      if (parsedResult) {
        console.log(`run-mvp: reusing PARSED_RESULT ${parsedResult.id} (sourceResultId=${ocrResult!.id})`);
        const parsed = (parsedResult.extractedJson as any).parsed;
        steps["parse-ocr"] = { status: "ok", resultId: parsedResult.id, reused: true };
        finalResult = {
          resultId: parsedResult.id,
          lineItemCount: parsed.lineItems?.length ?? 0,
          docType: parsed.docType,
        };
      } else {
        console.log(`run-mvp: running parse-ocr for OCR_RESULT ${ocrResult!.id}`);

        const ocrArray = (ocrResult!.extractedJson as any).ocr as Array<{ filename: string; text: string }>;
        const combinedText = ocrArray
          .map((item) => `--- ${item.filename} ---\n${item.text || ""}`)
          .join("\n\n");

        const parsed = parseOcrToStructured(combinedText);

        const result = await storage.createIngestionResult({
          ingestionJobId: job.id,
          rawText: combinedText,
          extractedJson: { sourceResultId: ocrResult!.id, parsed } as any,
          confidenceScore: null,
          status: "pending",
        });

        if (parsed.lineItems.length > 0) {
          await storage.updateIngestionJobStatus(job.id, "completed");
        } else {
          await storage.updateIngestionJobStatus(job.id, "needs_review", "No line items parsed from OCR");
        }

        steps["parse-ocr"] = { status: "ok", resultId: result.id };
        finalResult = {
          resultId: result.id,
          lineItemCount: parsed.lineItems.length,
          docType: parsed.docType,
        };
      }

      console.log(`run-mvp: pipeline completed for job ${job.id}`);

      return res.json({
        ok: true,
        jobId: job.id,
        steps,
        final: finalResult,
      });
    }
  } catch (err: any) {
    console.error("run-mvp error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err?.message,
      steps,
    });
  }
});

app.post("/api/ingestion/jobs/:id/process-from-s3", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.fileUrl) {
      await storage.updateIngestionJobStatus(job.id, "failed", "Missing fileUrl on ingestion job");
      return res.status(400).json({ message: "Job missing fileUrl" });
    }

    const { bucket, key } = parseS3Url(job.fileUrl);
    const rawEml = await getS3ObjectText(bucket, key);

    const parsed = await parseEml(rawEml);
    const extractedText = parsed.text;

    // ✅ Fallback: no body text found, mark for review (don’t fail)
    if (!extractedText) {
      const fallback = [
        "NO_BODY_TEXT_EXTRACTED",
        `subject: ${parsed.subject ?? ""}`,
        `from: ${parsed.from ?? ""}`,
        `to: ${parsed.to ?? ""}`,
        `date: ${parsed.date ?? ""}`,
        `hasHtml: ${parsed.hasHtml}`,
        `attachmentsCount: ${parsed.attachmentsCount}`,
        `attachments: ${parsed.attachmentNames.join(", ")}`,
        "",
        "RAW_EML_PREVIEW:",
        rawEml.slice(0, 5000),
      ].join("\n");

      const result = await storage.createIngestionResult({
        ingestionJobId: job.id,
        rawText: fallback,
        extractedJson: {
          subject: parsed.subject,
          from: parsed.from,
          to: parsed.to,
          date: parsed.date,
          hasHtml: parsed.hasHtml,
          attachmentsCount: parsed.attachmentsCount,
          attachmentNames: parsed.attachmentNames,
          note: "No body text extracted; fallback stored",
        },
        confidenceScore: null,
        status: "pending",
      });

      await storage.updateIngestionJobExtractedText(job.id, fallback.slice(0, 50000));
      await storage.updateIngestionJobStatus(job.id, "needs_review");

      return res.status(200).json({
        ok: true,
        jobId: job.id,
        resultId: result.id,
        source: "s3",
        note: "No body text extracted; job marked needs_review",
        meta: {
          subject: parsed.subject,
          from: parsed.from,
          to: parsed.to,
          date: parsed.date,
          hasHtml: parsed.hasHtml,
          attachmentsCount: parsed.attachmentsCount,
          attachmentNames: parsed.attachmentNames,
        },
      });
    }

    // ✅ Normal path: got body text
    const result = await storage.createIngestionResult({
      ingestionJobId: job.id,
      rawText: extractedText,
      extractedJson: {
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        date: parsed.date,
        hasHtml: parsed.hasHtml,
        attachmentsCount: parsed.attachmentsCount,
        attachmentNames: parsed.attachmentNames,
      },
      confidenceScore: null,
      status: "pending",
    });

    await storage.updateIngestionJobExtractedText(job.id, extractedText.slice(0, 50000));
    await storage.updateIngestionJobStatus(job.id, "completed");

    return res.json({
      ok: true,
      jobId: job.id,
      resultId: result.id,
      source: "s3",
      meta: {
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        date: parsed.date,
        hasHtml: parsed.hasHtml,
        attachmentsCount: parsed.attachmentsCount,
        attachmentNames: parsed.attachmentNames,
      },
    });
  } catch (err: any) {
    console.error("process-from-s3 error:", err);

    const name = err?.name || err?.Code;
    if (name === "NoSuchKey") return res.status(404).json({ message: "S3 object not found", key: err?.Key });
    if (name === "AccessDenied") return res.status(403).json({ message: "S3 access denied" });
    if (name === "PermanentRedirect") return res.status(400).json({ message: "S3 bucket region mismatch", endpoint: err?.Endpoint });

    return res.status(500).json({ message: "Server error" });
  }
});


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

  app.post("/api/companies", requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);

      // Get or create the user and link them to the company as owner
      if (req.user) {
        const user = await storage.getOrCreateUser({
          firebaseUid: req.user.uid,
          email: req.user.email,
          displayName: req.user.name || null,
        });

        // Set trial info
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        await storage.updateCompanySubscription(company.id, {
          subscriptionStatus: "trialing",
          subscriptionPlan: "starter",
          trialEndsAt,
        });

        // Link user to company as owner
        await storage.addUserToCompany({
          userId: user.id,
          companyId: company.id,
          role: "owner",
        });
      }

      res.status(201).json(company);
    } catch (error: any) {
      console.error("[companies] Create error:", error);
      res.status(400).json({ error: error.message || "Invalid company data" });
    }
  });

  // ========== DAILY LOGS ==========
  // Get daily logs for a company
  app.get("/api/companies/:companyId/daily-logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { projectId, startDate, endDate } = req.query;
      const logs = await storage.getDailyLogs(req.params.companyId, {
        projectId: projectId as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      });
      res.json(logs);
    } catch (error: any) {
      console.error("[daily-logs] Get error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single daily log
  app.get("/api/daily-logs/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const log = await storage.getDailyLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: "Daily log not found" });
      }
      res.json(log);
    } catch (error: any) {
      console.error("[daily-logs] Get error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create daily log
  app.post("/api/companies/:companyId/daily-logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { projectId, logDate, weather, temperatureHigh, temperatureLow, workersOnSite,
        workPerformed, materialsDelivered, equipmentUsed, delays, safetyIncidents,
        visitorLog, notes, photos } = req.body;

      // Check if log already exists for this project/date
      const existing = await storage.getDailyLogByDate(projectId, logDate);
      if (existing) {
        return res.status(400).json({ error: "A daily log already exists for this project and date" });
      }

      // Get user ID from auth
      const user = req.user ? await storage.getUserByFirebaseUid(req.user.uid) : null;

      const log = await storage.createDailyLog({
        companyId: req.params.companyId,
        projectId,
        logDate,
        weather,
        temperatureHigh,
        temperatureLow,
        workersOnSite,
        workPerformed,
        materialsDelivered,
        equipmentUsed,
        delays,
        safetyIncidents,
        visitorLog,
        notes,
        photos: photos || [],
        createdBy: user?.id || null,
      });

      res.status(201).json(log);
    } catch (error: any) {
      console.error("[daily-logs] Create error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Update daily log
  app.patch("/api/daily-logs/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const log = await storage.updateDailyLog(req.params.id, req.body);
      res.json(log);
    } catch (error: any) {
      console.error("[daily-logs] Update error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Delete daily log
  app.delete("/api/daily-logs/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.deleteDailyLog(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[daily-logs] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========== NOTIFICATIONS ==========
  // Get user's notifications
  app.get("/api/notifications", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user ? await storage.getUserByFirebaseUid(req.user.uid) : null;
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const unreadOnly = req.query.unreadOnly === "true";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const notificationsList = await storage.getNotifications(user.id, { unreadOnly, limit });
      const unreadCount = await storage.getUnreadNotificationCount(user.id);

      res.json({ notifications: notificationsList, unreadCount });
    } catch (error: any) {
      console.error("[notifications] Get error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get unread count only (lightweight)
  app.get("/api/notifications/unread-count", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user ? await storage.getUserByFirebaseUid(req.user.uid) : null;
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      const count = await storage.getUnreadNotificationCount(user.id);
      res.json({ count });
    } catch (error: any) {
      console.error("[notifications] Count error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark notification as read
  app.post("/api/notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
    try {
      const notification = await storage.markNotificationRead(req.params.id);
      res.json(notification);
    } catch (error: any) {
      console.error("[notifications] Mark read error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user ? await storage.getUserByFirebaseUid(req.user.uid) : null;
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      await storage.markAllNotificationsRead(user.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[notifications] Mark all read error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete notification
  app.delete("/api/notifications/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("[notifications] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get notification preferences
  app.get("/api/notification-preferences", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user ? await storage.getUserByFirebaseUid(req.user.uid) : null;
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      let prefs = await storage.getNotificationPreferences(user.id);
      if (!prefs) {
        // Create default preferences
        prefs = await storage.upsertNotificationPreferences(user.id, {});
      }
      res.json(prefs);
    } catch (error: any) {
      console.error("[notification-prefs] Get error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update notification preferences
  app.patch("/api/notification-preferences", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user ? await storage.getUserByFirebaseUid(req.user.uid) : null;
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      const prefs = await storage.upsertNotificationPreferences(user.id, req.body);
      res.json(prefs);
    } catch (error: any) {
      console.error("[notification-prefs] Update error:", error);
      res.status(500).json({ error: error.message });
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
      const { companyId } = req.query;
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (companyId && project.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied: project belongs to different company" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.get("/api/projects/:id/transactions", async (req, res) => {
    try {
      const { companyId } = req.query;
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (companyId && project.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied: project belongs to different company" });
      }
      const transactions = await storage.getProjectTransactions(req.params.id);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/projects/:id/summary", async (req, res) => {
    try {
      const { companyId } = req.query;
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (companyId && project.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied: project belongs to different company" });
      }
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

  // Portfolio Summary (aggregated across all projects)
  app.get("/api/companies/:companyId/portfolio-summary", async (req, res) => {
    try {
      const summary = await storage.getCompanyPortfolioSummary(req.params.companyId);
      res.json({ ok: true, ...summary });
    } catch (error) {
      console.error("Portfolio summary error:", error);
      res.status(500).json({ error: "Failed to fetch portfolio summary" });
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
      const { companyId } = req.query;
      const report = await storage.getWeeklyReport(req.params.id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      if (companyId && report.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied: report belongs to different company" });
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

      const transactions: any[] = [];
      for (const row of rows) {
        const mappedRow: Record<string, string> = {};
        if (mapping) {
          for (const [csvCol, dbCol] of Object.entries(mapping)) {
            if (dbCol && (row as any)[csvCol] !== undefined) {
              mappedRow[dbCol as string] = String((row as any)[csvCol]);
            }
          }
        } else {
          Object.assign(mappedRow, row as any);
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

  // QuickBooks Integration (stub)
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
      const { state: companyId, realmId } = req.query;
      if (!companyId) {
        return res.status(400).json({ error: "Invalid callback - missing state" });
      }
      await storage.upsertQbConnection(companyId as string, {
        realmId: (realmId as string) || null,
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
      await storage.upsertQbConnection(companyId as string, { lastSyncAt: new Date() });
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

app.get("/api/companies/:companyId/ingestion/jobs", async (req, res) => {
  try {
    const jobs = await storage.getIngestionJobs(req.params.companyId);
    res.json(jobs);
  } catch (error: any) {
    console.error("GET ingestion jobs failed:", error);
    res.status(500).json({
      error: "Failed to fetch ingestion jobs",
      detail: process.env.NODE_ENV !== "production" ? (error?.message || String(error)) : undefined,
    });
  }
});

  app.get("/api/ingestion/jobs/:id", async (req, res) => {
    try {
      const { companyId } = req.query;
      const job = await storage.getIngestionJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Ingestion job not found" });
      }
      if (companyId && job.companyId !== companyId) {
        return res.status(403).json({ error: "Access denied - job belongs to different company" });
      }
      const results = await storage.getIngestionResults(job.id);
      res.json({ ...job, results });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ingestion job" });
    }
  });

  app.post("/api/companies/:companyId/ingestion/upload", async (req, res) => {
    try {
      const { filename, sourceType, fileUrl } = req.body;
      if (!sourceType) {
        return res.status(400).json({ error: "sourceType is required (pdf, image, email)" });
      }
      const job = await storage.createIngestionJob({
        companyId: req.params.companyId,
        sourceType,
        filename: filename || null,
        fileUrl: fileUrl || null,
        status: "pending"
      });
      res.status(201).json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to create ingestion job" });
    }
  });

  // Email Ingestion Webhook (generic stub)
  app.post("/api/ingestion/email", async (req, res) => {
    try {
      const { to, subject } = req.body;
      if (!to) {
        return res.status(400).json({ error: "Missing 'to' field" });
      }
      const emailAlias = String(to).split("@")[0];
      const companies = await storage.getCompanies();
      const company = companies.find(c => c.ingestionEmailAlias === emailAlias);
      if (!company) {
        return res.status(404).json({ error: "No company found for email alias" });
      }
      const job = await storage.createIngestionJob({
        companyId: company.id,
        sourceType: "email",
        filename: subject || "Email attachment",
        fileUrl: "",
        status: "pending"
      });
      res.status(201).json({
        message: "Email received and queued for processing",
        jobId: job.id,
        companyId: company.id,
        note: "Stub - actual email parsing and attachment extraction not implemented"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to process email webhook" });
    }
  });

  // ✅ SES RAW INGESTION (Lambda -> Backend)  (THIS IS THE IMPORTANT FIX)
  app.post("/api/ingestion/ses/raw", async (req, res) => {
    try {
      const token = req.header("x-ingest-token");
      if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { bucket, key, to, from, subject, messageId, receivedAt, rawPreview } = req.body ?? {};
      if (!bucket || !key) {
        return res.status(400).json({ message: "Missing bucket/key" });
      }

      // Extract alias: invoices@tradenet.tech -> "invoices"
      const toEmail = String(to || "").toLowerCase().trim();
      const localPart = toEmail.includes("@") ? toEmail.split("@")[0] : toEmail;

      if (!localPart) {
        return res.status(400).json({ message: "Missing recipient (to)" });
      }

      // Best default: companyId should NOT be null → require a match
      const companies = await storage.getCompanies();
      const company = companies.find((c) => c.ingestionEmailAlias === localPart);

      if (!company) {
        return res.status(404).json({
          message: "No company matched alias",
          alias: localPart,
          fileUrl: `s3://${bucket}/${key}`,
        });
      }

      // Create ingestion job pointing to S3 object
      const job = await storage.createIngestionJob({
        companyId: company.id,
        sourceType: "email",
        filename: `${String(subject || "email").slice(0, 80)}.eml`,
        fileUrl: `s3://${bucket}/${key}`,
        status: "pending",
      });

      return res.json({
        ok: true,
        job,
        meta: {
          to: toEmail,
          from,
          subject,
          messageId,
          receivedAt,
          rawPreview: rawPreview ? String(rawPreview).slice(0, 2000) : null,
        },
      });
    } catch (err) {
      console.error("SES RAW ingestion error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

// ========== REVIEW QUEUE ENDPOINTS ==========

// Hints for each review reason
const REVIEW_REASON_HINTS: Record<string, string> = {
  no_attachments: "Email had no PDF/image attachments. Check for invoice links or forwarded content.",
  ocr_empty: "Attachment unreadable or OCR failed. Try clearer PDF or image.",
  ocr_failed: "OCR processing encountered an error. Check file format.",
  no_total: "Could not find invoice total. Approve with overrideTotal.",
  parse_failed: "Failed to parse OCR text. Check document structure.",
  categorize_failed: "Failed to categorize line items. Manual review needed.",
  not_invoice: "Document doesn't appear to be an invoice. Approve if it is valid.",
  missing_file: "Source file URL is missing from job.",
  extract_failed: "Failed to extract attachments from email.",
  persist_failed: "Failed to save transaction to ledger.",
  unknown_error: "An unexpected error occurred during processing.",
};

// List jobs needing review
app.get("/api/companies/:companyId/ingestion/review", async (req, res) => {
  try {
    const { companyId } = req.params;
    const status = String(req.query.status || "pending");
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const jobs = await storage.listIngestionJobsNeedingReview(companyId, status, limit);

    // Map to include relevant fields with hints
    const mapped = jobs.map((job: any) => ({
      id: job.id,
      filename: job.filename,
      createdAt: job.createdAt,
      status: job.status,
      needsReview: job.needsReview,
      reviewReason: job.reviewReason,
      reviewStatus: job.reviewStatus,
      reviewedAt: job.reviewedAt,
      errorMessage: job.errorMessage,
      hint: REVIEW_REASON_HINTS[job.reviewReason] || "Manual review required.",
      finalParsedResultId: job.finalParsedResultId,
      finalCategorizedResultId: job.finalCategorizedResultId,
      overrideTotal: job.overrideTotal,
      overrideVendorName: job.overrideVendorName,
    }));

    return res.json({
      ok: true,
      companyId,
      status,
      count: mapped.length,
      jobs: mapped,
    });
  } catch (error: any) {
    console.error("Review queue error:", error);
    return res.status(500).json({ error: "Failed to fetch review queue", message: error?.message });
  }
});

// Approve or reject a job in review queue
app.post("/api/ingestion/jobs/:id/review", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const jobId = String(req.params.id);
    const { action, note, overrideVendorName, overrideTotal } = req.body ?? {};

    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action is required and must be 'approve' or 'reject'" });
    }

    const job = await storage.getIngestionJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const company = await storage.getCompany(job.companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });

    if (action === "reject") {
      // Mark as rejected, don't persist to ledger
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: false,
        reviewReason: null, // Clear the reason
        reviewStatus: "rejected",
        reviewedAt: new Date(),
      });
      await storage.updateIngestionJobStatus(job.id, "rejected", note || "Rejected via review");

      return res.json({
        ok: true,
        jobId: job.id,
        action: "rejected",
        status: "rejected",
        note: note || null,
      });
    }

    // action === "approve"
    // Store overrides if provided
    const updates: any = {
      reviewStatus: "approved",
      reviewedAt: new Date(),
    };

    if (overrideVendorName) {
      updates.overrideVendorName = String(overrideVendorName).trim();
    }

    if (overrideTotal !== undefined && overrideTotal !== null) {
      const totalNum = parseFloat(String(overrideTotal));
      if (isNaN(totalNum) || totalNum <= 0) {
        return res.status(400).json({ error: "overrideTotal must be a positive number" });
      }
      updates.overrideTotal = totalNum.toFixed(2);
    }

    await storage.updateIngestionJobReviewFields(job.id, updates);

    // Now try to persist to ledger
    // Fetch updated job with overrides
    const updatedJob = await storage.getIngestionJob(jobId);
    if (!updatedJob) {
      return res.status(500).json({ message: "Failed to fetch updated job" });
    }

    // Get categorized result
    const results = await storage.getIngestionResults(job.id);
    const sorted = [...results].sort((a: any, b: any) => {
      const at = new Date(a.createdAt ?? 0).getTime();
      const bt = new Date(b.createdAt ?? 0).getTime();
      return bt - at;
    });

    const categorizedResult = sorted.find((r: any) => {
      const ej = r?.extractedJson;
      return !!(ej && ej.categorized && Array.isArray(ej.categorized.lineItems));
    });

    if (!categorizedResult) {
      return res.status(400).json({
        ok: false,
        message: "No categorized result found. Cannot persist ledger.",
        jobId: job.id,
      });
    }

    const categorized = (categorizedResult.extractedJson as any)?.categorized;

    // Determine final values
    const finalTotal = updates.overrideTotal
      ? parseFloat(updates.overrideTotal)
      : (Array.isArray(categorized?.totals?.possibleTotals) && categorized.totals.possibleTotals.length > 0
        ? Number(categorized.totals.possibleTotals[0])
        : null);

    if (!finalTotal || finalTotal <= 0) {
      return res.status(400).json({
        ok: false,
        message: "No valid total found or provided. Please specify overrideTotal.",
        jobId: job.id,
      });
    }

    const finalVendorName = updates.overrideVendorName || categorized?.vendorOrClient || null;

    // Resolve vendor
    let vendorId: string | null = null;
    if (finalVendorName) {
      const vendor = await storage.findOrCreateVendor(company.id, finalVendorName);
      vendorId = vendor.id;
    }

    // Resolve project
    let projectId: string | null = null;
    if (categorized?.projectName) {
      const projects = await storage.getProjects(company.id);
      const normalizeKey = (s: string) => s.toLowerCase().trim();
      const existing = projects.find((p: any) => normalizeKey(p.name) === normalizeKey(categorized.projectName));
      projectId = existing?.id ?? (await storage.createProject({
        companyId: company.id,
        name: categorized.projectName,
        status: "active",
      } as any)).id;
    }

    // Idempotent delete
    const deletedCount = await storage.deleteTransactionsBySourceRef({
      companyId: company.id,
      source: "ingestion",
      sourceRef: job.id,
    });

    // Date
    const txnDate = job.createdAt
      ? new Date(job.createdAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    // Category
    const docType = String(categorized?.docType ?? "");
    const topCategory =
      docType.includes("payroll") ? "labor" :
      docType.includes("equipment") ? "equipment" :
      "material";

    // Create transaction
    const createdTxn = await storage.createTransaction({
      companyId: company.id,
      projectId,
      vendorId,
      type: "expense",
      direction: "out",
      amount: finalTotal.toFixed(2),
      currency: "USD",
      txnDate,
      category: topCategory,
      description: `Invoice total - ${finalVendorName ?? "Unknown vendor"}`,
      memo: JSON.stringify({
        ingestionJobId: job.id,
        categorizedResultId: categorizedResult.id,
        reviewApproved: true,
        overrideTotal: updates.overrideTotal ?? null,
        overrideVendorName: updates.overrideVendorName ?? null,
        note: note || null,
      }),
      vendor: finalVendorName || null,
      source: "ingestion",
      sourceRef: job.id,
    } as any);

    // Update job
    await storage.updateIngestionJobFinalResults(job.id, {
      finalCategorizedResultId: String(categorizedResult.id),
      finalParsedResultId: (categorizedResult.extractedJson as any)?.sourceResultId ?? null,
    });

    await storage.updateIngestionJobReviewFields(job.id, {
      needsReview: false,
      reviewReason: null,
      reviewStatus: "approved",
      reviewedAt: new Date(),
    });

    await storage.updateIngestionJobStatus(job.id, "completed");

    return res.json({
      ok: true,
      jobId: job.id,
      action: "approved",
      status: "completed",
      deletedPrevious: deletedCount,
      transaction: {
        id: createdTxn.id,
        amount: createdTxn.amount,
        category: createdTxn.category,
        txnDate: createdTxn.txnDate,
        vendorId: createdTxn.vendorId,
        vendorName: finalVendorName,
        projectId: createdTxn.projectId,
      },
      overrides: {
        total: updates.overrideTotal ?? null,
        vendorName: updates.overrideVendorName ?? null,
      },
      note: note || null,
    });
  } catch (error: any) {
    console.error("Review action error:", error);
    return res.status(500).json({ error: "Failed to process review action", message: error?.message });
  }
});

// ========== WEEKLY SUMMARY JSON ENDPOINT ==========
app.get("/api/companies/:companyId/reports/weekly/summary", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { weekStart, weekEnd } = req.query;

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: "weekStart and weekEnd query parameters are required (YYYY-MM-DD)" });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Fetch transactions for the date range
    const txns = await storage.getTransactions(companyId, {
      startDate: weekStart as string,
      endDate: weekEnd as string,
    });

    // Calculate totals
    let expenses = 0;
    let income = 0;
    const byCategory: Record<string, number> = {};
    const byVendor: Record<string, number> = {};

    for (const txn of txns) {
      const amount = parseFloat(txn.amount);

      if (txn.direction === "out") {
        expenses += amount;

        // By category
        const cat = txn.category || "uncategorized";
        byCategory[cat] = (byCategory[cat] || 0) + amount;

        // By vendor (only for expenses)
        const vendor = txn.vendor || "Unknown";
        byVendor[vendor] = (byVendor[vendor] || 0) + amount;
      } else {
        income += amount;
      }
    }

    // Format category breakdown
    const byCategoryList = Object.entries(byCategory)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    // Format top vendors
    const topVendors = Object.entries(byVendor)
      .map(([vendor, total]) => ({ vendor, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return res.json({
      ok: true,
      weekStart,
      weekEnd,
      totals: {
        expenses,
        income,
        net: income - expenses,
      },
      byCategory: byCategoryList,
      topVendors,
      txCount: txns.length,
    });
  } catch (error: any) {
    console.error("Weekly summary error:", error);
    return res.status(500).json({ error: "Failed to generate weekly summary", message: error?.message });
  }
});

  app.post("/api/ingestion/jobs/:id/process", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // MVP: take text from request (later we fetch from S3 + parse attachments)
    const { extractedText } = req.body ?? {};
    const text = String(extractedText || "").trim();

    if (!text) {
      await storage.updateIngestionJobStatus(job.id, "failed", "Missing extractedText in request");
      return res.status(400).json({ message: "extractedText is required for MVP processor" });
    }

    // Save extraction result
    const result = await storage.createIngestionResult({
      ingestionJobId: job.id,
      rawText: text,
      extractedJson: null,
      confidenceScore: null,
      status: "pending",
    });

    // Mirror preview onto job for convenience
    await storage.updateIngestionJobExtractedText(job.id, text.slice(0, 50000));
    await storage.updateIngestionJobStatus(job.id, "completed");

    return res.json({ ok: true, jobId: job.id, resultId: result.id });
  } catch (err) {
    console.error("Process job error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ========== WEEKLY CSV EXPORT ==========
app.get("/api/companies/:companyId/reports/weekly/csv", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { weekStart, weekEnd } = req.query;

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: "weekStart and weekEnd query parameters are required (YYYY-MM-DD)" });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Fetch transactions for the date range
    const txns = await storage.getTransactions(companyId, {
      startDate: weekStart as string,
      endDate: weekEnd as string,
    });

    // CSV escaping: wrap in quotes if contains comma/quote/newline, escape inner quotes
    const csvEscape = (value: any): string => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    // Build CSV
    const headers = ["txnDate", "projectId", "vendor", "category", "amount", "source", "sourceRef", "description"];
    const rows: string[] = [headers.join(",")];

    for (const txn of txns) {
      const row = [
        csvEscape(txn.txnDate),
        csvEscape(txn.projectId ?? ""),
        csvEscape(txn.vendor ?? ""),
        csvEscape(txn.category ?? ""),
        csvEscape(txn.amount),
        csvEscape(txn.source),
        csvEscape(txn.sourceRef ?? ""),
        csvEscape(txn.description ?? ""),
      ];
      rows.push(row.join(","));
    }

    const csvContent = rows.join("\n");
    const filename = `weekly_report_${weekStart}_${weekEnd}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error) {
    console.error("CSV export error:", error);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

// ========== BATCH PIPELINE TEST HARNESS ==========
// Helper: Get latest result for a specific step based on extractedJson shape
function getLatestResultForStep(
  results: any[],
  stepName: "extract-attachments" | "ocr-attachments" | "parse-ocr" | "categorize-parsed"
): any | null {
  // Sort by createdAt descending (newest first)
  const sorted = [...results].sort((a, b) => {
    const at = new Date(a.createdAt ?? 0).getTime();
    const bt = new Date(b.createdAt ?? 0).getTime();
    return bt - at;
  });

  for (const r of sorted) {
    const ej = r.extractedJson;
    if (!ej) continue;

    switch (stepName) {
      case "extract-attachments":
        // Has attachments array with s3Url, NO ocr, NO parsed, NO categorized
        if (Array.isArray(ej.attachments) && ej.attachments.length > 0 && ej.attachments[0]?.s3Url && !ej.ocr && !ej.parsed && !ej.categorized) {
          return r;
        }
        break;
      case "ocr-attachments":
        // Has ocr array, NO parsed, NO categorized
        if (Array.isArray(ej.ocr) && !ej.parsed && !ej.categorized) {
          return r;
        }
        break;
      case "parse-ocr":
        // Has parsed object with lineItems, NO categorized
        if (ej.parsed && Array.isArray(ej.parsed.lineItems) && !ej.categorized) {
          return r;
        }
        break;
      case "categorize-parsed":
        // Has categorized object with lineItems
        if (ej.categorized && Array.isArray(ej.categorized.lineItems)) {
          return r;
        }
        break;
    }
  }
  return null;
}

// Helper: Check if OCR result has usable text
function hasUsableOcrText(ocrResult: any): boolean {
  const ej = ocrResult?.extractedJson;
  if (!ej || !Array.isArray(ej.ocr)) return false;
  const combinedText = ej.ocr.map((o: any) => String(o?.text ?? "").trim()).join("").trim();
  return combinedText.length > 0;
}

app.post("/api/ingestion/run-batch", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { companyId, force } = req.query;
    const forceRerun = force === "1" || force === "true";
    const limit = Math.min(parseInt(String(req.query.limit || "20"), 10), 100);

    if (!companyId) {
      return res.status(400).json({ error: "companyId query parameter is required" });
    }

    const company = await storage.getCompany(companyId as string);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Fetch jobs (newest first)
    const allJobs = await storage.getIngestionJobs(companyId as string);
    const jobs = allJobs.slice(0, limit);

    type StepResult = { ok: boolean; error?: string; resultId?: string; reused?: boolean };
    type JobResult = {
      jobId: string;
      filename: string | null;
      steps: Record<string, StepResult>;
      totalsFound: boolean;
      persisted: boolean;
      transactionId?: string;
      error?: string;
    };

    const results: JobResult[] = [];
    const vendorsFailingTotals: string[] = [];
    let totalsDetectedCount = 0;
    let needsReviewCount = 0;
    let persistedCount = 0;

    // Helper to mark job for review queue
    const markJobForReview = async (
      jobId: string,
      reviewReason: string,
      errorMessage: string
    ): Promise<void> => {
      await storage.updateIngestionJobReviewFields(jobId, {
        needsReview: true,
        reviewReason,
        reviewStatus: "pending",
        reviewedAt: null,
      });
      await storage.updateIngestionJobStatus(jobId, "needs_review", errorMessage);
    };

    // Pipeline runner for each job
    for (const job of jobs) {
      const jr: JobResult = {
        jobId: job.id,
        filename: job.filename,
        steps: {},
        totalsFound: false,
        persisted: false,
      };

      try {
        if (!job.fileUrl) {
          jr.error = "Missing fileUrl";
          jr.steps["extract-attachments"] = { ok: false, error: "Missing fileUrl" };
          await markJobForReview(job.id, "missing_file", "Missing fileUrl");
          needsReviewCount++;
          results.push(jr);
          continue;
        }

        // Get all existing results for this job once
        let allResults = await storage.getIngestionResults(job.id);

        // ---- STEP 1: extract-attachments ----
        // For upload jobs, skip email parsing and create synthetic attachment result
        let attResultId: string | null = null;
        let attResult: any = null;
        try {
          // Handle upload jobs differently - no email parsing needed
          if (job.sourceType === "upload") {
            const existingAtt = getLatestResultForStep(allResults, "extract-attachments");

            if (existingAtt && !forceRerun) {
              attResult = existingAtt;
              attResultId = existingAtt.id;
              jr.steps["extract-attachments"] = { ok: true, resultId: existingAtt.id, reused: true };
            } else {
              // Create synthetic attachment result pointing to the uploaded file
              const meta = {
                subject: null,
                from: null,
                to: null,
                date: job.createdAt ? new Date(job.createdAt).toISOString() : null,
                hasHtml: false,
                attachmentsCount: 1,
                attachmentNames: [job.filename],
                inlineCount: 0,
                forwardedCount: 0,
                linksFoundCount: 0,
                links: [],
                sourceType: "upload",
              };

              // Determine content type from filename
              const filename = job.filename || "upload.bin";
              let contentType = "application/octet-stream";
              if (filename.toLowerCase().endsWith(".pdf")) contentType = "application/pdf";
              else if (filename.toLowerCase().endsWith(".png")) contentType = "image/png";
              else if (filename.toLowerCase().endsWith(".jpg") || filename.toLowerCase().endsWith(".jpeg")) contentType = "image/jpeg";

              attResult = await storage.createIngestionResult({
                ingestionJobId: job.id,
                rawText: "",
                extractedJson: {
                  meta,
                  attachments: [{
                    filename,
                    contentType,
                    size: 0, // Unknown for uploaded files
                    s3Url: job.fileUrl,
                    source: "upload",
                  }],
                } as any,
                confidenceScore: null,
                status: "pending",
              });
              attResultId = attResult.id;
              allResults.push(attResult);
              jr.steps["extract-attachments"] = { ok: true, resultId: attResult.id, reused: false };
            }
          } else {
            // Original email handling
            const existingAtt = getLatestResultForStep(allResults, "extract-attachments");

            if (existingAtt && !forceRerun) {
              // Reuse existing result
              attResult = existingAtt;
              attResultId = existingAtt.id;
              const attachments = existingAtt.extractedJson?.attachments ?? [];
              if (attachments.length === 0) {
                jr.steps["extract-attachments"] = { ok: true, error: "No attachments found", resultId: existingAtt.id, reused: true };
                jr.error = "No attachments found";
                await markJobForReview(job.id, "no_attachments", "No attachments found");
                needsReviewCount++;
                results.push(jr);
              continue;
            }
            jr.steps["extract-attachments"] = { ok: true, resultId: existingAtt.id, reused: true };
          } else {
            // Run step fresh
            const { bucket, key } = parseS3Url(job.fileUrl);
            const rawEml = await getS3ObjectText(bucket, key);
            const parsed = await parseEmlWithAttachments(rawEml);
            const attachments = parsed?.attachments ?? [];

            const meta = {
              subject: parsed.subject,
              from: parsed.from,
              to: parsed.to,
              date: parsed.date,
              hasHtml: parsed.hasHtml,
              attachmentsCount: parsed.attachmentsCount,
              attachmentNames: parsed.attachmentNames,
            };

            if (attachments.length === 0) {
              const result = await storage.createIngestionResult({
                ingestionJobId: job.id,
                rawText: parsed.text || "",
                extractedJson: { meta, attachments: [], note: "No attachments" } as any,
                confidenceScore: null,
                status: "pending",
              });
              jr.steps["extract-attachments"] = { ok: true, error: "No attachments found", resultId: result.id, reused: false };
              jr.error = "No attachments found";
              await markJobForReview(job.id, "no_attachments", "No attachments found");
              needsReviewCount++;
              results.push(jr);
              continue;
            }

            // Upload attachments to S3
            const uploaded: Array<{ filename: string; contentType: string; size: number; s3Url: string }> = [];
            const prefix = `attachments/${job.id}/${Date.now()}`;

            for (const att of attachments) {
              const safeName = (att.filename && String(att.filename).trim()) || "attachment.bin";
              const contentType = att.contentType || "application/octet-stream";
              const normalizedName = safeName.replace(/[\/\\]/g, "_");
              const outKey = `${prefix}-${normalizedName}`;

              const s3Url = await putS3ObjectBuffer({ bucket, key: outKey, body: att.content, contentType });
              uploaded.push({ filename: normalizedName, contentType, size: att.content?.length ?? 0, s3Url });
            }

            attResult = await storage.createIngestionResult({
              ingestionJobId: job.id,
              rawText: parsed.text || "",
              extractedJson: { meta, attachments: uploaded } as any,
              confidenceScore: null,
              status: "pending",
            });
            attResultId = attResult.id;
            allResults.push(attResult); // Add to cache
            jr.steps["extract-attachments"] = { ok: true, resultId: attResult.id, reused: false };
          }
          } // End of else block for email handling
        } catch (err: any) {
          jr.steps["extract-attachments"] = { ok: false, error: err?.message };
          jr.error = err?.message;
          await markJobForReview(job.id, "extract_failed", err?.message || "Extract attachments failed");
          needsReviewCount++;
          results.push(jr);
          continue;
        }

        // ---- STEP 2: ocr-attachments ----
        let ocrResultId: string | null = null;
        let ocrResult: any = null;
        try {
          const existingOcr = getLatestResultForStep(allResults, "ocr-attachments");

          // Only reuse if it has usable text
          if (existingOcr && !forceRerun && hasUsableOcrText(existingOcr)) {
            ocrResult = existingOcr;
            ocrResultId = existingOcr.id;
            jr.steps["ocr-attachments"] = { ok: true, resultId: existingOcr.id, reused: true };
          } else {
            // Find attachment result to OCR from
            const sourceAttResult = attResult || getLatestResultForStep(allResults, "extract-attachments");
            if (!sourceAttResult) throw new Error("No attachment result found");

            const attachments = (sourceAttResult.extractedJson as any).attachments;
            const ocrResults: any[] = [];
            const allTextParts: string[] = [];

            for (const att of attachments) {
              if (!isSupportedFile(att.filename, att.contentType)) {
                ocrResults.push({ filename: att.filename, text: "", skipped: true, skipReason: "Unsupported file type" });
                continue;
              }
              try {
                const { bucket: b, key: k } = parseS3Url(att.s3Url);
                const textractResult = await textractSmartOCR(b, k, att.contentType);
                ocrResults.push({ filename: att.filename, text: textractResult.text, pages: textractResult.pageCount, confidence: textractResult.confidence });
                if (textractResult.text) allTextParts.push(`--- ${att.filename} ---\n${textractResult.text}`);
              } catch (ocrErr: any) {
                ocrResults.push({ filename: att.filename, text: "", error: ocrErr?.message });
              }
            }

            const combinedText = allTextParts.join("\n\n").trim();
            ocrResult = await storage.createIngestionResult({
              ingestionJobId: job.id,
              rawText: combinedText,
              extractedJson: { attachments, ocr: ocrResults, sourceResultId: sourceAttResult.id, combinedText } as any,
              confidenceScore: null,
              status: "pending",
            });
            ocrResultId = ocrResult.id;
            allResults.push(ocrResult);
            jr.steps["ocr-attachments"] = { ok: true, resultId: ocrResult.id, reused: false };
          }

          // Check if OCR has usable text
          if (!hasUsableOcrText(ocrResult)) {
            jr.steps["ocr-attachments"].error = "OCR returned no usable text";
            jr.error = "OCR returned no usable text";
            jr.totalsFound = false;
            await markJobForReview(job.id, "ocr_empty", "OCR returned no usable text");
            needsReviewCount++;
            results.push(jr);
            continue;
          }
        } catch (err: any) {
          jr.steps["ocr-attachments"] = { ok: false, error: err?.message };
          jr.error = err?.message;
          await markJobForReview(job.id, "ocr_failed", err?.message || "OCR processing failed");
          needsReviewCount++;
          results.push(jr);
          continue;
        }

        // ---- STEP 3: parse-ocr ----
        let parseResultId: string | null = null;
        let parseResult: any = null;
        try {
          const existingParse = getLatestResultForStep(allResults, "parse-ocr");

          if (existingParse && !forceRerun) {
            parseResult = existingParse;
            parseResultId = existingParse.id;
            jr.steps["parse-ocr"] = { ok: true, resultId: existingParse.id, reused: true };
          } else {
            const sourceOcrResult = ocrResult || getLatestResultForStep(allResults, "ocr-attachments");
            if (!sourceOcrResult) throw new Error("No OCR result found");

            const ocrArray = (sourceOcrResult.extractedJson as any).ocr;
            const combinedText = ocrArray.map((o: any) => `--- ${o.filename} ---\n${o.text || ""}`).join("\n\n");
            const parsed = parseOcrToStructured(combinedText);

            parseResult = await storage.createIngestionResult({
              ingestionJobId: job.id,
              rawText: combinedText,
              extractedJson: { sourceResultId: sourceOcrResult.id, parsed } as any,
              confidenceScore: null,
              status: "pending",
            });
            parseResultId = parseResult.id;
            allResults.push(parseResult);
            jr.steps["parse-ocr"] = { ok: true, resultId: parseResult.id, reused: false };
          }
        } catch (err: any) {
          jr.steps["parse-ocr"] = { ok: false, error: err?.message };
          jr.error = err?.message;
          await markJobForReview(job.id, "parse_failed", err?.message || "Parse OCR failed");
          needsReviewCount++;
          results.push(jr);
          continue;
        }

        // ---- STEP 4: categorize-parsed ----
        let catResultId: string | null = null;
        let categorized: any = null;
        try {
          const existingCat = getLatestResultForStep(allResults, "categorize-parsed");

          if (existingCat && !forceRerun) {
            catResultId = existingCat.id;
            categorized = existingCat.extractedJson?.categorized;
            jr.steps["categorize-parsed"] = { ok: true, resultId: existingCat.id, reused: true };
          } else {
            const sourceParsedResult = parseResult || getLatestResultForStep(allResults, "parse-ocr");
            if (!sourceParsedResult) throw new Error("No parsed result found");

            const parsedData = (sourceParsedResult.extractedJson as any).parsed;
            const categorizedLineItems = (parsedData.lineItems as any[]).map((li: any) => {
              const c = categorizeLineItem(String(li.description ?? ""));
              return { ...li, category: c.category, categoryConfidence: c.confidence, matchedKeyword: c.matchedKeyword ?? null };
            });

            categorized = {
              docType: parsedData.docType ?? null,
              projectName: parsedData.projectName ?? null,
              vendorOrClient: parsedData.vendorOrClient ?? null,
              totals: parsedData.totals ?? {},
              warnings: parsedData.warnings ?? [],
              lineItems: categorizedLineItems,
            };

            const catRes = await storage.createIngestionResult({
              ingestionJobId: job.id,
              rawText: "",
              extractedJson: { categorized, sourceResultId: sourceParsedResult.id } as any,
              confidenceScore: null,
              status: "pending",
            });
            catResultId = catRes.id;
            allResults.push(catRes);
            jr.steps["categorize-parsed"] = { ok: true, resultId: catRes.id, reused: false };
          }
        } catch (err: any) {
          jr.steps["categorize-parsed"] = { ok: false, error: err?.message };
          jr.error = err?.message;
          await markJobForReview(job.id, "categorize_failed", err?.message || "Categorize parsed failed");
          needsReviewCount++;
          results.push(jr);
          continue;
        }

        // ---- STEP 5: persist-ledger (always runs fresh, idempotent) ----
        try {
          const possibleTotals = categorized?.totals?.possibleTotals;
          const invoiceTotal = Array.isArray(possibleTotals) && possibleTotals.length > 0 ? Number(possibleTotals[0]) : null;

          if (!invoiceTotal || invoiceTotal <= 0) {
            jr.totalsFound = false;
            jr.steps["persist-ledger"] = { ok: false, error: "No invoice total found" };
            if (categorized?.vendorOrClient) {
              vendorsFailingTotals.push(categorized.vendorOrClient);
            }
            await markJobForReview(job.id, "no_total", "No invoice total found");
            needsReviewCount++;
            results.push(jr);
            continue;
          }

          jr.totalsFound = true;
          totalsDetectedCount++;

          // Idempotent: delete existing then insert
          const deletedCount = await storage.deleteTransactionsBySourceRef({ companyId: company.id, source: "ingestion", sourceRef: job.id });

          // Resolve project/vendor
          const normalizeKey = (s: string) => s.toLowerCase().trim();
          let projectId: string | null = null;
          let vendorId: string | null = null;

          if (categorized.projectName) {
            const projects = await storage.getProjects(company.id);
            const existing = projects.find((p: any) => normalizeKey(p.name) === normalizeKey(categorized.projectName));
            projectId = existing?.id ?? (await storage.createProject({ companyId: company.id, name: categorized.projectName, status: "active" } as any)).id;
          }

          if (categorized.vendorOrClient) {
            const vendors = await storage.getVendors(company.id);
            const existing = vendors.find((v: any) => normalizeKey(v.name) === normalizeKey(categorized.vendorOrClient));
            vendorId = existing?.id ?? (await storage.createVendor({ companyId: company.id, name: categorized.vendorOrClient } as any)).id;
          }

          const txnDate = job.createdAt ? new Date(job.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
          const docType = String(categorized.docType ?? "");
          const topCategory = docType.includes("payroll") ? "labor" : docType.includes("equipment") ? "equipment" : "material";

          // DEDUPE CHECK: Look for existing transaction with same vendor, amount, date
          const amountStr = invoiceTotal.toFixed(2);
          const existingDupe = await storage.findDuplicateTransaction({
            companyId: company.id,
            vendorId,
            amount: amountStr,
            txnDate,
            lookbackDays: 7,
          });

          if (existingDupe) {
            // Duplicate detected - mark job completed but flag as duplicate
            jr.persisted = false;
            jr.steps["persist-ledger"] = {
              ok: true,
              error: "duplicate_detected",
            };
            (jr as any).duplicateOf = existingDupe.id;
            (jr as any).note = `Duplicate of transaction ${existingDupe.id} (same vendor, amount, date within 7 days)`;

            await storage.updateIngestionJobFinalResults(job.id, {
              finalCategorizedResultId: catResultId,
              finalParsedResultId: parseResultId,
            });

            // Store duplicate info in a result record for reference
            await storage.createIngestionResult({
              ingestionJobId: job.id,
              rawText: "",
              extractedJson: {
                duplicate: true,
                duplicateOf: existingDupe.id,
                duplicateAmount: existingDupe.amount,
                duplicateVendor: existingDupe.vendor,
                duplicateTxnDate: existingDupe.txnDate,
              } as any,
              confidenceScore: null,
              status: "duplicate",
            });

            // Set review fields - not needs_review since it's handled automatically
            await storage.updateIngestionJobReviewFields(job.id, {
              needsReview: false,
              reviewReason: "duplicate",
              reviewStatus: "auto_skipped",
              reviewedAt: new Date(),
            });
            await storage.updateIngestionJobStatus(job.id, "completed", `Duplicate of transaction ${existingDupe.id}`);

            results.push(jr);
            continue;
          }

          const createdTxn = await storage.createTransaction({
            companyId: company.id,
            projectId,
            vendorId,
            type: "expense",
            direction: "out",
            amount: invoiceTotal.toFixed(2),
            currency: "USD",
            txnDate,
            category: topCategory,
            description: `Invoice total - ${categorized.vendorOrClient ?? "Unknown vendor"}`,
            memo: JSON.stringify({ ingestionJobId: job.id, categorizedResultId: catResultId, deletedPrevious: deletedCount }),
            vendor: categorized.vendorOrClient || null,
            source: "ingestion",
            sourceRef: job.id,
          } as any);

          await storage.updateIngestionJobFinalResults(job.id, {
            finalCategorizedResultId: catResultId,
            finalParsedResultId: parseResultId,
          });

          await storage.updateIngestionJobStatus(job.id, "completed");

          jr.persisted = true;
          jr.transactionId = createdTxn.id;
          jr.steps["persist-ledger"] = { ok: true, reused: false };
          persistedCount++;
        } catch (err: any) {
          jr.steps["persist-ledger"] = { ok: false, error: err?.message };
          jr.error = err?.message;
          await markJobForReview(job.id, "persist_failed", err?.message || "Persist to ledger failed");
          needsReviewCount++;
        }

        results.push(jr);
      } catch (outerErr: any) {
        jr.error = outerErr?.message || "Unknown error";
        try {
          await markJobForReview(job.id, "unknown_error", outerErr?.message || "Unknown error");
          needsReviewCount++;
        } catch (_) { /* ignore review update failure */ }
        results.push(jr);
      }
    }

    // Build top vendors failing totals
    const vendorCounts: Record<string, number> = {};
    for (const v of vendorsFailingTotals) {
      vendorCounts[v] = (vendorCounts[v] || 0) + 1;
    }
    const topVendorsFailingTotals = Object.entries(vendorCounts)
      .map(([vendor, count]) => ({ vendor, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return res.json({
      ok: true,
      companyId,
      limit,
      force: forceRerun,
      totalsDetectedCount,
      needsReviewCount,
      persistedCount,
      topVendorsFailingTotals,
      jobs: results,
    });
  } catch (error: any) {
    console.error("run-batch error:", error);
    return res.status(500).json({ error: "Failed to run batch", message: error?.message });
  }
});

// ========== SYNC INBOUND EMAILS FROM S3 ==========
app.post("/api/ingestion/sync-inbound", async (req, res) => {
  try {
    // Auth check
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { companyId, limit: limitParam } = req.query;

    if (!companyId || typeof companyId !== "string") {
      return res.status(400).json({ error: "companyId query parameter is required" });
    }

    // Verify company exists
    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const limit = Math.min(Math.max(parseInt(String(limitParam) || "10", 10), 1), 100);

    // Configurable bucket and prefix
    const bucket = process.env.INBOUND_EMAIL_BUCKET || "tradenet-inbound-email-prod";
    const prefix = process.env.INBOUND_EMAIL_PREFIX || "raw/";

    // Keys to ignore
    const ignoreKeys = new Set([
      "raw/",
      "raw/AMAZON_SES_SETUP_NOTIFICATION",
    ]);

    // List objects from S3
    let s3Objects;
    try {
      s3Objects = await listS3Objects({ bucket, prefix, maxKeys: limit + ignoreKeys.size + 10 });
    } catch (s3Err: any) {
      console.error("S3 list error:", s3Err);
      return res.status(500).json({
        error: "Failed to list S3 objects",
        message: s3Err?.message,
        bucket,
        prefix,
      });
    }

    // Filter out ignored keys and take limit
    const validKeys = s3Objects
      .filter((obj) => obj.key && !ignoreKeys.has(obj.key))
      .slice(0, limit);

    const createdJobs: { id: string; fileUrl: string; filename: string; status: string }[] = [];
    let skippedCount = 0;

    for (const obj of validKeys) {
      const fileUrl = `s3://${bucket}/${obj.key}`;

      // Check if job already exists for this file_url
      const existingJob = await storage.findIngestionJobByFileUrl(fileUrl);
      if (existingJob) {
        skippedCount++;
        continue;
      }

      // Extract filename (basename of key)
      const filename = obj.key.split("/").pop() || obj.key;

      // Create new ingestion job
      const newJob = await storage.createIngestionJob({
        companyId,
        sourceType: "email",
        status: "queued",
        filename,
        fileUrl,
      });

      createdJobs.push({
        id: newJob.id,
        fileUrl: newJob.fileUrl,
        filename: newJob.filename,
        status: newJob.status,
      });
    }

    return res.json({
      ok: true,
      companyId,
      limit,
      bucket,
      prefix,
      foundKeys: validKeys.length,
      created: createdJobs.length,
      skipped: skippedCount,
      jobs: createdJobs,
    });
  } catch (error: any) {
    console.error("sync-inbound error:", error);
    return res.status(500).json({ error: "Failed to sync inbound emails", message: error?.message });
  }
});

// ========== FILE UPLOAD INGESTION ==========
app.post("/api/ingestion/upload", upload.single("file"), async (req, res) => {
  try {
    // Auth check
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { companyId } = req.query;

    if (!companyId || typeof companyId !== "string") {
      return res.status(400).json({ error: "companyId query parameter is required" });
    }

    // Verify company exists
    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Check file was uploaded
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded. Use field name 'file'" });
    }

    // Create job first to get the ID for S3 key
    const originalFilename = file.originalname || "upload.bin";
    const safeFilename = originalFilename
      .replace(/[\/\\]/g, "_")
      .replace(/[^\w.\-()+\s]/g, "_")
      .slice(0, 180);

    // Determine bucket (use upload bucket or fall back to inbound email bucket)
    const bucket = process.env.INGEST_UPLOAD_BUCKET || process.env.INBOUND_EMAIL_BUCKET || "tradenet-inbound-email-prod";

    // Create ingestion job to get ID
    const newJob = await storage.createIngestionJob({
      companyId,
      sourceType: "upload",
      status: "queued",
      filename: safeFilename,
      fileUrl: "", // Will update after S3 upload
    });

    // Upload to S3 with path: uploads/{companyId}/{jobId}/{filename}
    const s3Key = `uploads/${companyId}/${newJob.id}/${safeFilename}`;
    const s3Url = await putS3ObjectBuffer({
      bucket,
      key: s3Key,
      body: file.buffer,
      contentType: file.mimetype,
    });

    // Update job with actual S3 URL
    await storage.updateIngestionJobFileUrl(newJob.id, s3Url);

    console.log(`[upload] Created job ${newJob.id} for file ${safeFilename} (${file.size} bytes)`);

    return res.json({
      ok: true,
      jobId: newJob.id,
      fileUrl: s3Url,
      filename: safeFilename,
      contentType: file.mimetype,
      size: file.size,
    });
  } catch (error: any) {
    console.error("upload error:", error);

    // Handle multer errors
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large. Maximum size is 15MB" });
    }
    if (error.message?.includes("Invalid file type")) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: "Failed to upload file", message: error?.message });
  }
});

// ========== RETRY OCR ENDPOINT ==========
app.post("/api/ingestion/jobs/:id/retry-ocr", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const { mode } = req.body || {};
    const forceOcr = mode === "force_ocr";
    const forcePdfText = mode === "force_pdf_text";

    console.log(`[retry-ocr] Job ${job.id}, mode: ${mode || "auto"}`);

    // Get existing results to find attachments
    const results = await storage.getIngestionResults(job.id);
    const attachmentResult = results.find(
      (r) => r.extractedJson && (r.extractedJson as any).attachments?.length > 0
    );

    if (!attachmentResult) {
      return res.status(400).json({
        error: "No attachments found for this job. Cannot retry OCR.",
      });
    }

    const attachments = (attachmentResult.extractedJson as any).attachments as Array<{
      filename: string;
      contentType: string;
      size: number;
      s3Url: string;
    }>;

    // Re-run OCR on attachments
    const ocrResults: any[] = [];
    const allTextParts: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const att of attachments) {
      const { filename, contentType, s3Url } = att;

      if (!isSupportedFile(filename, contentType)) {
        ocrResults.push({
          filename,
          s3Url,
          text: "",
          skipped: true,
          skipReason: "Unsupported file type",
        });
        continue;
      }

      try {
        const { bucket, key } = parseS3Url(s3Url);
        let result;

        if (forceOcr && isPdfFile(filename, contentType)) {
          // Force OCR even for text PDFs
          console.log(`[retry-ocr] Forcing Textract OCR for ${filename}`);
          const { textractPdfFromS3 } = await import("./textract");
          result = await textractPdfFromS3(bucket, key);
          (result as any).textSource = "ocr_forced";
        } else if (forcePdfText && isPdfFile(filename, contentType)) {
          // Force PDF text extraction only
          console.log(`[retry-ocr] Forcing PDF text extraction for ${filename}`);
          const { getS3ObjectBuffer } = await import("./textract");
          const { extractPdfText } = await import("./pdfExtract");
          const pdfBuffer = await getS3ObjectBuffer(bucket, key);
          const pdfResult = await extractPdfText(pdfBuffer);
          result = {
            text: pdfResult.text,
            pageCount: pdfResult.pageCount,
            confidence: 100,
            lineCount: pdfResult.text.split("\n").length,
            method: "pdf_text" as const,
            textSource: "pdf_embedded_forced",
            pdfDebug: pdfResult.debug,
          };
        } else {
          // Auto mode - let textractSmartOCR decide
          result = await textractSmartOCR(bucket, key, contentType);
        }

        ocrResults.push({
          filename,
          s3Url,
          text: result.text,
          textLength: result.text.length,
          textSource: (result as any).textSource,
          pages: result.pageCount,
          confidence: result.confidence,
          method: result.method,
          s3Debug: (result as any).s3Debug,
          pdfDebug: (result as any).pdfDebug,
        });

        if (result.text) {
          allTextParts.push(`--- ${filename} ---\n${result.text}`);
          successCount++;
        }
      } catch (err: any) {
        if (err instanceof TextractStillInProgressError) {
          console.warn(`[retry-ocr] OCR still in progress for ${filename}: ${err.message}`);
          ocrResults.push({
            filename,
            s3Url,
            text: "",
            error: `TEXTRACT_IN_PROGRESS: ${err.message}`,
            textractJobId: err.jobId,
            stillInProgress: true,
          });
        } else {
          console.error(`[retry-ocr] Error for ${filename}:`, err?.message);
          ocrResults.push({
            filename,
            s3Url,
            text: "",
            error: err?.message,
          });
        }
        errorCount++;
      }
    }

    const combinedText = allTextParts.join("\n\n").trim();
    const stillInProgress = ocrResults.some((r: any) => r.stillInProgress);

    // Create new OCR result
    const ocrResult = await storage.createIngestionResult({
      ingestionJobId: job.id,
      rawText: combinedText,
      extractedJson: {
        attachments,
        ocr: ocrResults,
        sourceResultId: attachmentResult.id,
        combinedText,
        retryMode: mode || "auto",
        stillInProgress,
      } as any,
      confidenceScore: null,
      status: "pending",
    });

    // Update job extracted text
    if (combinedText) {
      await storage.updateIngestionJobExtractedText(job.id, combinedText.slice(0, 50000));

      // Reset review fields for re-processing
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: false,
        reviewReason: null,
        reviewStatus: "pending",
        reviewedAt: null,
      });
      await storage.updateIngestionJobStatus(job.id, "queued");
    } else if (stillInProgress) {
      // Textract jobs still in progress - keep job queued for retry
      await storage.updateIngestionJobStatus(job.id, "processing", "Textract OCR still in progress - retry later");
    } else {
      await storage.updateIngestionJobReviewFields(job.id, {
        needsReview: true,
        reviewReason: "ocr_empty",
        reviewStatus: "pending",
        reviewedAt: null,
      });
      await storage.updateIngestionJobStatus(job.id, "needs_review", "OCR retry returned no text");
    }

    return res.json({
      ok: true,
      jobId: job.id,
      stillInProgress,
      resultId: ocrResult.id,
      mode: mode || "auto",
      successCount,
      errorCount,
      textLength: combinedText.length,
      hasText: combinedText.length > 0,
      ocr: ocrResults,
      textPreview: combinedText.slice(0, 500),
    });
  } catch (error: any) {
    console.error("retry-ocr error:", error);
    return res.status(500).json({ error: "Failed to retry OCR", message: error?.message });
  }
});

// ========== PDF-PARSE TEST ENDPOINT ==========
// Verify pdf-parse library is working correctly
app.get("/api/ingestion/test-pdf-parse", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { testPdfParse } = await import("./pdfExtract");
    const result = await testPdfParse();

    return res.json({
      ok: result.success,
      ...result,
    });
  } catch (error: any) {
    console.error("test-pdf-parse error:", error);
    return res.status(500).json({ ok: false, error: error?.message });
  }
});

// ========== DEBUG ENDPOINT ==========
// Returns comprehensive diagnostic info for a job without modifying state
app.get("/api/ingestion/jobs/:id/debug", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Get all results
    const results = await storage.getIngestionResults(job.id);

    // Sort by createdAt descending
    const sortedResults = [...results].sort((a, b) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return bt - at;
    });

    // Find attachment result
    const attachmentResult = sortedResults.find(
      (r) => r.extractedJson && (r.extractedJson as any).attachments?.length > 0 && !(r.extractedJson as any).ocr
    );

    // Find OCR result
    const ocrResult = sortedResults.find(
      (r) => r.extractedJson && Array.isArray((r.extractedJson as any).ocr)
    );

    // Find parsed result
    const parsedResult = sortedResults.find(
      (r) => r.extractedJson && (r.extractedJson as any).parsed
    );

    // Find categorized result
    const categorizedResult = sortedResults.find(
      (r) => r.extractedJson && (r.extractedJson as any).categorized
    );

    // Extract attachment debug info
    const attachments = attachmentResult
      ? (attachmentResult.extractedJson as any).attachments
      : [];

    // Get file-level debug info for each attachment
    const fileDebugInfo: any[] = [];
    for (const att of attachments) {
      if (!att.s3Url) continue;

      try {
        const { bucket, key } = parseS3Url(att.s3Url);
        const { debugS3File } = await import("./textract");
        const debug = await debugS3File(bucket, key);
        fileDebugInfo.push({
          filename: att.filename,
          s3Url: att.s3Url,
          ...debug,
        });
      } catch (err: any) {
        fileDebugInfo.push({
          filename: att.filename,
          s3Url: att.s3Url,
          error: err?.message,
        });
      }
    }

    // OCR-level debug
    const ocrDebug = ocrResult ? (ocrResult.extractedJson as any).ocr : [];

    // Check for common issues
    const diagnostics: string[] = [];

    if (!attachmentResult) {
      diagnostics.push("NO_ATTACHMENT_RESULT: No attachment extraction result found");
    } else if (attachments.length === 0) {
      diagnostics.push("NO_ATTACHMENTS: Email had no processable attachments");
    }

    if (!ocrResult) {
      diagnostics.push("NO_OCR_RESULT: OCR step has not been run");
    } else {
      const ocrArr = (ocrResult.extractedJson as any).ocr || [];
      const hasText = ocrArr.some((o: any) => o.text && o.text.length > 0);
      if (!hasText) {
        diagnostics.push("OCR_EMPTY: OCR completed but returned no text");
      }
    }

    // Check file-level issues
    for (const fd of fileDebugInfo) {
      if (fd.error) {
        diagnostics.push(`FILE_ERROR[${fd.filename}]: ${fd.error}`);
      } else if (fd.s3Debug && !fd.s3Debug.isPdfMagic && fd.isPdf) {
        diagnostics.push(`INVALID_PDF_MAGIC[${fd.filename}]: Expected %PDF but got "${fd.s3Debug.magicBytes}"`);
      } else if (fd.pdfDebug?.possibleImageOnlyPdf) {
        diagnostics.push(`IMAGE_ONLY_PDF[${fd.filename}]: PDF appears to contain scanned images, needs OCR`);
      } else if (fd.pdfDebug?.parseError) {
        diagnostics.push(`PDF_PARSE_ERROR[${fd.filename}]: ${fd.pdfDebug.parseError}`);
      }
    }

    if (!parsedResult && ocrResult) {
      diagnostics.push("NO_PARSED_RESULT: Parse step has not been run after OCR");
    }

    return res.json({
      ok: true,
      jobId: job.id,
      job: {
        id: job.id,
        companyId: job.companyId,
        status: job.status,
        sourceType: job.sourceType,
        fileUrl: job.fileUrl,
        needsReview: job.needsReview,
        reviewReason: job.reviewReason,
        reviewStatus: job.reviewStatus,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        processedAt: job.processedAt,
      },
      results: {
        total: results.length,
        attachmentResultId: attachmentResult?.id,
        ocrResultId: ocrResult?.id,
        parsedResultId: parsedResult?.id,
        categorizedResultId: categorizedResult?.id,
      },
      attachments: attachments.map((a: any) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        s3Url: a.s3Url,
      })),
      fileDebugInfo,
      ocrDebug: ocrDebug.map((o: any) => ({
        filename: o.filename,
        textLength: o.textLength || o.text?.length || 0,
        textSource: o.textSource,
        method: o.method,
        pages: o.pages,
        confidence: o.confidence,
        error: o.error,
        skipped: o.skipped,
        skipReason: o.skipReason,
        s3Debug: o.s3Debug,
        pdfDebug: o.pdfDebug,
      })),
      parsedSummary: parsedResult ? {
        resultId: parsedResult.id,
        lineItemCount: (parsedResult.extractedJson as any).parsed?.lineItems?.length || 0,
        docType: (parsedResult.extractedJson as any).parsed?.docType,
        warnings: (parsedResult.extractedJson as any).parsed?.warnings || [],
        totals: (parsedResult.extractedJson as any).parsed?.totals,
      } : null,
      diagnostics,
      hint: diagnostics.length > 0
        ? `Found ${diagnostics.length} potential issue(s). Review diagnostics array for details.`
        : "No obvious issues detected. Check fileDebugInfo and ocrDebug for detailed analysis.",
    });
  } catch (error: any) {
    console.error("debug endpoint error:", error);
    return res.status(500).json({ error: "Debug failed", message: error?.message });
  }
});

// ========== SINGLE JOB RUN ENDPOINT ==========
// Process a single job through the full pipeline (useful for testing/debugging)
app.post("/api/ingestion/jobs/:id/run", async (req, res) => {
  const steps: Record<string, { status: string; resultId?: string; error?: string; duration?: number }> = {};
  const startTime = Date.now();

  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const { skipPersist, forceReprocess } = req.body || {};

    console.log(`[run-single] Starting job ${job.id}, skipPersist=${skipPersist}, forceReprocess=${forceReprocess}`);

    // Check if job is already completed (unless forceReprocess)
    if (!forceReprocess && job.status === "completed") {
      return res.json({
        ok: true,
        jobId: job.id,
        message: "Job already completed. Use forceReprocess=true to re-run.",
        status: job.status,
      });
    }

    // Reset job status for processing
    await storage.updateIngestionJobStatus(job.id, "processing");

    // Determine source type and process accordingly
    const sourceType = job.sourceType || "email";
    let results = await storage.getIngestionResults(job.id);

    // Helper to sort by createdAt descending
    const sortByCreatedAtDesc = <T extends { createdAt?: Date | string | null }>(arr: T[]): T[] => {
      return [...arr].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return 0;
      });
    };

    // ========== STEP 1: GET/EXTRACT ATTACHMENTS ==========
    let stepStart = Date.now();
    let attResult: typeof results[0] | undefined;

    if (sourceType === "upload") {
      // For direct uploads, job.fileUrl IS the attachment
      // Check if we already have an attachment result
      const existingAtt = sortByCreatedAtDesc(results).find(
        (r) => r.extractedJson && (r.extractedJson as any).attachments?.length > 0 && !(r.extractedJson as any).ocr
      );

      if (existingAtt && !forceReprocess) {
        attResult = existingAtt;
        steps["extract-attachments"] = { status: "reused", resultId: existingAtt.id, duration: Date.now() - stepStart };
      } else {
        // Create synthetic attachment result for the uploaded file
        const filename = job.fileUrl?.split("/").pop() || "uploaded-file";
        const { bucket, key } = parseS3Url(job.fileUrl!);
        const { getS3ObjectMetadata } = await import("./textract");
        const metadata = await getS3ObjectMetadata(bucket, key);

        const result = await storage.createIngestionResult({
          ingestionJobId: job.id,
          rawText: "",
          extractedJson: {
            meta: { source: "upload", filename },
            attachments: [{
              filename,
              contentType: metadata.contentType || "application/pdf",
              size: metadata.contentLength || 0,
              s3Url: job.fileUrl,
            }],
          } as any,
          confidenceScore: null,
          status: "pending",
        });

        attResult = result;
        results.push(result);
        steps["extract-attachments"] = { status: "ok", resultId: result.id, duration: Date.now() - stepStart };
      }
    } else {
      // Email source - run extract-attachments
      if (!job.fileUrl) {
        await storage.updateIngestionJobStatus(job.id, "failed", "Missing fileUrl");
        return res.status(400).json({ error: "Job missing fileUrl" });
      }

      const existingAtt = sortByCreatedAtDesc(results).find(
        (r) => r.extractedJson && (r.extractedJson as any).attachments?.length > 0 && !(r.extractedJson as any).ocr
      );

      if (existingAtt && !forceReprocess) {
        attResult = existingAtt;
        steps["extract-attachments"] = { status: "reused", resultId: existingAtt.id, duration: Date.now() - stepStart };
      } else {
        const { bucket, key } = parseS3Url(job.fileUrl);
        const rawEml = await getS3ObjectText(bucket, key);
        const parsed = await parseEmlWithAttachments(rawEml);
        const attachments = parsed?.attachments ?? [];

        if (attachments.length === 0) {
          await storage.updateIngestionJobReviewFields(job.id, {
            needsReview: true,
            reviewReason: "no_attachments",
            reviewStatus: "pending",
          });
          await storage.updateIngestionJobStatus(job.id, "needs_review", "No attachments found");
          steps["extract-attachments"] = { status: "no_attachments", duration: Date.now() - stepStart };

          return res.json({
            ok: false,
            jobId: job.id,
            steps,
            message: "Pipeline stopped: no attachments found in email",
            totalDuration: Date.now() - startTime,
          });
        }

        // Upload attachments to S3
        const uploaded: any[] = [];
        const prefix = `attachments/${job.id}/${Date.now()}`;

        for (const att of attachments) {
          const safeName = att.filename?.trim() || "attachment.bin";
          const normalizedName = safeName.replace(/[\/\\]/g, "_").slice(0, 180);
          const outKey = `${prefix}/${normalizedName}`;

          const s3Url = await putS3ObjectBuffer({
            bucket,
            key: outKey,
            body: att.content,
            contentType: att.contentType || "application/octet-stream",
          });

          uploaded.push({
            filename: normalizedName,
            contentType: att.contentType || "application/octet-stream",
            size: att.size || att.content?.length || 0,
            s3Url,
          });
        }

        const result = await storage.createIngestionResult({
          ingestionJobId: job.id,
          rawText: parsed.text || "",
          extractedJson: {
            meta: { subject: parsed.subject, from: parsed.from, to: parsed.to, date: parsed.date },
            attachments: uploaded,
          } as any,
          confidenceScore: null,
          status: "pending",
        });

        attResult = result;
        results.push(result);
        steps["extract-attachments"] = { status: "ok", resultId: result.id, duration: Date.now() - stepStart };
      }
    }

    // ========== STEP 2: OCR ATTACHMENTS ==========
    stepStart = Date.now();
    let ocrResultRecord: typeof results[0] | undefined;

    const attachments = (attResult!.extractedJson as any).attachments as Array<{
      filename: string;
      contentType: string;
      size: number;
      s3Url: string;
    }>;

    // Check for existing OCR result
    const existingOcr = sortByCreatedAtDesc(results).find(
      (r) => r.extractedJson && Array.isArray((r.extractedJson as any).ocr) &&
        (r.extractedJson as any).sourceResultId === attResult!.id
    );

    // Check if existing has usable text
    const getOcrText = (r: any) => {
      const arr = r?.extractedJson?.ocr || [];
      return arr.map((o: any) => o.text || "").join(" ").trim();
    };

    if (existingOcr && !forceReprocess && getOcrText(existingOcr).length > 0) {
      ocrResultRecord = existingOcr;
      steps["ocr-attachments"] = { status: "reused", resultId: existingOcr.id, duration: Date.now() - stepStart };
    } else {
      // Run OCR
      const ocrResults: any[] = [];
      const allTextParts: string[] = [];

      for (const att of attachments) {
        const { filename, contentType, s3Url } = att;

        if (!isSupportedFile(filename, contentType)) {
          ocrResults.push({
            filename,
            s3Url,
            text: "",
            skipped: true,
            skipReason: "Unsupported file type",
          });
          continue;
        }

        try {
          const { bucket, key } = parseS3Url(s3Url);
          const result = await textractSmartOCR(bucket, key, contentType, { includeDebug: true });

          ocrResults.push({
            filename,
            s3Url,
            text: result.text,
            textLength: result.text.length,
            textSource: result.textSource,
            pages: result.pageCount,
            confidence: result.confidence,
            method: result.method,
            s3Debug: result.s3Debug,
            pdfDebug: result.pdfDebug,
          });

          if (result.text) {
            allTextParts.push(`--- ${filename} ---\n${result.text}`);
          }
        } catch (err: any) {
          if (err instanceof TextractStillInProgressError) {
            console.warn(`[run-single] OCR still in progress for ${filename}: ${err.message}`);
            ocrResults.push({
              filename,
              s3Url,
              text: "",
              error: `TEXTRACT_IN_PROGRESS: ${err.message}`,
              textractJobId: err.jobId,
              stillInProgress: true,
            });
          } else {
            console.error(`[run-single] OCR error for ${filename}:`, err?.message);
            ocrResults.push({
              filename,
              s3Url,
              text: "",
              error: err?.message,
            });
          }
        }
      }

      const combinedText = allTextParts.join("\n\n").trim();

      const result = await storage.createIngestionResult({
        ingestionJobId: job.id,
        rawText: combinedText,
        extractedJson: {
          attachments,
          ocr: ocrResults,
          sourceResultId: attResult!.id,
          combinedText,
        } as any,
        confidenceScore: null,
        status: "pending",
      });

      if (combinedText) {
        await storage.updateIngestionJobExtractedText(job.id, combinedText.slice(0, 50000));
      }

      ocrResultRecord = result;
      results.push(result);
      steps["ocr-attachments"] = { status: "ok", resultId: result.id, duration: Date.now() - stepStart };

      // Check if OCR returned no text
      if (!combinedText) {
        await storage.updateIngestionJobReviewFields(job.id, {
          needsReview: true,
          reviewReason: "ocr_empty",
          reviewStatus: "pending",
        });
        await storage.updateIngestionJobStatus(job.id, "needs_review", "OCR returned no text");

        return res.json({
          ok: false,
          jobId: job.id,
          steps,
          message: "Pipeline stopped: OCR returned no usable text",
          hint: "Use GET /api/ingestion/jobs/:id/debug for detailed diagnostics",
          ocrResults,
          totalDuration: Date.now() - startTime,
        });
      }
    }

    // ========== STEP 3: PARSE OCR ==========
    stepStart = Date.now();
    let parsedResultRecord: typeof results[0] | undefined;

    const existingParsed = sortByCreatedAtDesc(results).find(
      (r) => r.extractedJson && (r.extractedJson as any).parsed &&
        (r.extractedJson as any).sourceResultId === ocrResultRecord!.id
    );

    if (existingParsed && !forceReprocess) {
      parsedResultRecord = existingParsed;
      steps["parse-ocr"] = { status: "reused", resultId: existingParsed.id, duration: Date.now() - stepStart };
    } else {
      const ocrArray = (ocrResultRecord!.extractedJson as any).ocr as Array<{ filename: string; text: string }>;
      const combinedText = ocrArray
        .map((item) => `--- ${item.filename} ---\n${item.text || ""}`)
        .join("\n\n");

      const parsed = parseOcrToStructured(combinedText);

      const result = await storage.createIngestionResult({
        ingestionJobId: job.id,
        rawText: combinedText,
        extractedJson: { sourceResultId: ocrResultRecord!.id, parsed } as any,
        confidenceScore: null,
        status: "pending",
      });

      parsedResultRecord = result;
      results.push(result);
      steps["parse-ocr"] = { status: "ok", resultId: result.id, duration: Date.now() - stepStart };
    }

    // ========== STEP 4: CATEGORIZE PARSED ==========
    stepStart = Date.now();
    let categorizedResultRecord: typeof results[0] | undefined;

    const parsedData = (parsedResultRecord!.extractedJson as any).parsed;

    const existingCategorized = sortByCreatedAtDesc(results).find(
      (r) => r.extractedJson && (r.extractedJson as any).categorized &&
        (r.extractedJson as any).sourceResultId === parsedResultRecord!.id
    );

    if (existingCategorized && !forceReprocess) {
      categorizedResultRecord = existingCategorized;
      steps["categorize-parsed"] = { status: "reused", resultId: existingCategorized.id, duration: Date.now() - stepStart };
    } else {
      const categorizedLineItems = (parsedData.lineItems as any[]).map((li) => {
        const desc = String(li.description ?? "");
        const c = categorizeLineItem(desc);
        return {
          ...li,
          category: c.category,
          categoryConfidence: c.confidence,
          matchedKeyword: c.matchedKeyword ?? null,
        };
      });

      const categorized = {
        docType: parsedData.docType ?? null,
        projectName: parsedData.projectName ?? null,
        vendorOrClient: parsedData.vendorOrClient ?? null,
        totals: parsedData.totals ?? {},
        warnings: parsedData.warnings ?? [],
        lineItems: categorizedLineItems,
      };

      const result = await storage.createIngestionResult({
        ingestionJobId: job.id,
        rawText: "",
        extractedJson: {
          categorized,
          sourceResultId: parsedResultRecord!.id,
        } as any,
        confidenceScore: null,
        status: "pending",
      });

      categorizedResultRecord = result;
      results.push(result);
      steps["categorize-parsed"] = { status: "ok", resultId: result.id, duration: Date.now() - stepStart };
    }

    // ========== STEP 5: PERSIST LEDGER ==========
    // Default: persist to invoices + invoice_line_items tables
    // Set skipPersist=true in request body to skip and stop at "ready"
    if (!skipPersist) {
      stepStart = Date.now();

      try {
        const categorized = (categorizedResultRecord!.extractedJson as any).categorized;
        const ocrText = ocrResultRecord!.rawText || "";

        // Invoice gating
        const invoiceCheck = isInvoiceLike(categorized, ocrText);
        if (!invoiceCheck.isInvoice) {
          await storage.updateIngestionJobReviewFields(job.id, {
            needsReview: true,
            reviewReason: "not_invoice",
            reviewStatus: "pending",
          });
          await storage.updateIngestionJobStatus(job.id, "needs_review", invoiceCheck.reason);
          steps["persist-ledger"] = { status: "not_invoice", error: invoiceCheck.reason, duration: Date.now() - stepStart };

          return res.json({
            ok: true,
            jobId: job.id,
            steps,
            message: "Pipeline completed but document is not an invoice",
            invoiceCheck,
            totalDuration: Date.now() - startTime,
          });
        }

        // Use enhanced extraction with LLM fallback for better totals and vendor
        const { extractInvoiceDataWithFallback } = await import("./invoiceExtract");
        const extractionResult = await extractInvoiceDataWithFallback(ocrText, (categorized.lineItems || []).length);
        const extraction = extractionResult.extraction;

        // Validate total
        const invoiceTotal = extraction.total;
        if (!invoiceTotal || Number.isNaN(invoiceTotal) || invoiceTotal <= 0) {
          await storage.updateIngestionJobReviewFields(job.id, {
            needsReview: true,
            reviewReason: "missing_total",
            reviewStatus: "pending",
          });
          await storage.updateIngestionJobStatus(job.id, "needs_review", "No invoice total found");
          steps["persist-ledger"] = { status: "missing_total", duration: Date.now() - stepStart };

          return res.json({
            ok: true,
            jobId: job.id,
            steps,
            message: "Pipeline completed but no invoice total found",
            extraction: {
              total: extraction.total,
              totalConfidence: extraction.totalConfidence,
              totalReason: extraction.totalReason,
              usedLlm: extractionResult.usedLlm,
              fallbackReasons: extractionResult.fallbackReasons,
            },
            totalDuration: Date.now() - startTime,
          });
        }

        // ========== CRITICAL CONFIDENCE GATE ==========
        // DO NOT PERSIST if:
        // 1. mustReview flag is set (LLM was needed but unavailable/failed, or post-LLM confidence too low)
        // 2. finalConfidence < 0.75 OR vendorConfidence < 0.75 OR totalConfidence < 0.8
        // 3. fallbackReasons contains "LLM fallback failed or unavailable"
        const finalConfidence = extraction.finalConfidence ?? Math.min(
          extraction.vendorConfidence,
          extraction.invoiceNumberConfidence || 0.5,
          extraction.invoiceDateConfidence || 0.5,
          extraction.totalConfidence
        );

        // Check for explicit mustReview flag from extraction
        const llmUnavailable = extractionResult.llmUnavailable === true;
        const hasFallbackFailure = (extractionResult.fallbackReasons || []).some(
          r => r.includes("LLM fallback failed") || r.includes("unavailable")
        );

        // Strict confidence gates for persistence
        const vendorTooLow = extraction.vendorConfidence < 0.75;
        const totalTooLow = extraction.totalConfidence < 0.8;
        const finalTooLow = finalConfidence < 0.75;

        const mustNotPersist = extractionResult.mustReview === true ||
          llmUnavailable ||
          hasFallbackFailure ||
          vendorTooLow ||
          totalTooLow ||
          finalTooLow;

        if (mustNotPersist) {
          // Determine the most specific reason
          let reviewReason = "low_confidence";
          let errorMessage = `Low extraction confidence: ${finalConfidence.toFixed(2)}`;

          if (llmUnavailable || hasFallbackFailure) {
            reviewReason = "llm_unavailable";
            errorMessage = "Low confidence extraction; LLM fallback unavailable. Requires manual review.";
          } else if (vendorTooLow) {
            reviewReason = "vendor_low_confidence";
            errorMessage = `Vendor confidence too low (${extraction.vendorConfidence.toFixed(2)} < 0.75): "${extraction.vendor}"`;
          } else if (totalTooLow) {
            reviewReason = "total_low_confidence";
            errorMessage = `Total confidence too low (${extraction.totalConfidence.toFixed(2)} < 0.8)`;
          } else if (extractionResult.mustReviewReason) {
            errorMessage = extractionResult.mustReviewReason;
          }

          await storage.updateIngestionJobReviewFields(job.id, {
            needsReview: true,
            reviewReason,
            reviewStatus: "pending",
          });
          await storage.updateIngestionJobStatus(job.id, "needs_review", errorMessage);

          steps["persist-ledger"] = {
            status: "needs_review",
            reviewReason,
            finalConfidence,
            vendorConfidence: extraction.vendorConfidence,
            totalConfidence: extraction.totalConfidence,
            llmUnavailable,
            fallbackReasons: extractionResult.fallbackReasons,
            mustReviewReason: extractionResult.mustReviewReason,
            duration: Date.now() - stepStart,
          };

          return res.json({
            ok: true,
            jobId: job.id,
            steps,
            message: `Pipeline completed but extraction requires manual review. NOT PERSISTED.`,
            persisted: false,
            reviewReason,
            extraction: {
              vendor: extraction.vendor,
              vendorConfidence: extraction.vendorConfidence,
              invoiceNumber: extraction.invoiceNumber,
              invoiceNumberConfidence: extraction.invoiceNumberConfidence,
              total: extraction.total,
              totalConfidence: extraction.totalConfidence,
              finalConfidence,
              usedLlm: extractionResult.usedLlm,
              llmUnavailable,
              fallbackReasons: extractionResult.fallbackReasons,
              mustReviewReason: extractionResult.mustReviewReason,
              llmMetrics: extractionResult.llmMetrics,
            },
            totalDuration: Date.now() - startTime,
          });
        }

        // Get vendor (from extraction, with fallback to categorized)
        const vendorName = extraction.vendor || categorized.vendorOrClient || null;

        // Find or create vendor if we have a name
        let vendorId: string | null = null;
        if (vendorName) {
          const vendor = await storage.findOrCreateVendor(job.companyId, vendorName);
          vendorId = vendor.id;
        }

        // Get invoice date (from extraction or job creation date)
        const invoiceDate = extraction.invoiceDate ||
          (job.createdAt ? new Date(job.createdAt as any).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

        // ========== PRODUCTION-HARDENED INVOICE PERSISTENCE ==========

        // 1. ENFORCE INVOICE NUMBER PRESENCE
        const rawInvoiceNumber = extraction.invoiceNumber;
        if (!rawInvoiceNumber || rawInvoiceNumber.trim() === "") {
          console.error(`[persist] FATAL: invoiceNumber is missing or empty for jobId=${job.id}`);
          throw new InvoiceNumberRequiredError();
        }

        // 2. NORMALIZE INVOICE NUMBER FOR DEDUPE
        const invoiceNumberNorm = normalizeInvoiceNumber(rawInvoiceNumber);
        console.log(`[persist] Normalized invoice number: "${rawInvoiceNumber}" -> "${invoiceNumberNorm}"`);

        // 3. CALCULATE RECONCILIATION DELTA
        const subtotalNum = extraction.subtotal ?? null;
        const taxNum = extraction.tax ?? null;
        const shippingNum = extraction.shipping ?? null;
        const reconciliationDelta = calculateReconciliationDelta(subtotalNum, taxNum, shippingNum, invoiceTotal);
        const needsReview = needsReconciliationReview(reconciliationDelta);
        const invoiceStatus = needsReview ? "needs_review" : "parsed_ok";

        if (reconciliationDelta !== null) {
          console.log(`[persist] Reconciliation: subtotal=${subtotalNum}, tax=${taxNum}, shipping=${shippingNum}, total=${invoiceTotal}, delta=${reconciliationDelta.toFixed(4)}, needsReview=${needsReview}`);
        }

        // Business key: (company_id, invoice_number_norm, invoice_date, total)
        const dedupeKey = {
          companyId: job.companyId,
          invoiceNumberNorm,
          invoiceDate,
          total: invoiceTotal.toFixed(2),
        };

        const existingInvoice = await storage.findInvoiceByDedupeKey(
          dedupeKey.companyId,
          dedupeKey.invoiceNumberNorm,
          dedupeKey.invoiceDate,
          dedupeKey.total
        );

        let invoice: any;
        let invoiceAction: "created" | "reused" | "updated" = "created";

        if (existingInvoice) {
          console.log(`[persist] Dedupe hit: found existing invoiceId=${existingInvoice.id} for key=(${dedupeKey.companyId}, ${dedupeKey.invoiceNumberNorm}, ${dedupeKey.invoiceDate}, ${dedupeKey.total})`);

          if (forceReprocess) {
            // forceReprocess=true: Update invoice, delete old line items, insert new ones
            console.log(`[persist] forceReprocess=true -> will update invoice and replace line items`);

            // Update invoice fields that may have changed
            invoice = await storage.updateInvoice(existingInvoice.id, {
              vendorId,
              vendor: vendorName,
              invoiceNumberNorm, // Keep normalized field in sync
              dueDate: extraction.dueDate,
              customerPo: extraction.customerPo,
              jobName: extraction.jobName,
              subtotal: extraction.subtotal?.toFixed(2) || null,
              tax: extraction.tax?.toFixed(2) || null,
              shipping: extraction.shipping?.toFixed(2) || null,
              totalConfidence: extraction.totalConfidence.toFixed(2),
              vendorConfidence: extraction.vendorConfidence.toFixed(2),
              extractionMethod: extraction.extractionMethod,
              reconciliationDelta: reconciliationDelta?.toFixed(2) || null,
              status: invoiceStatus,
              sourceJobId: job.id,
              sourceRef: job.fileUrl || null,
            });

            // Delete old line items
            const deletedCount = await storage.deleteInvoiceLineItems(existingInvoice.id);
            console.log(`[persist] Deleted ${deletedCount} old line items for invoice ${existingInvoice.id}`);

            invoiceAction = "updated";
          } else {
            // forceReprocess=false: Reuse existing invoice, skip line item insertion
            console.log(`[persist] Dedupe hit: returning existing invoiceId=${existingInvoice.id} (forceReprocess=false)`);
            invoice = existingInvoice;
            invoiceAction = "reused";

            // Return early - no line items to insert
            steps["persist-ledger"] = {
              status: "persisted",
              duration: Date.now() - stepStart,
              usedLlm: extractionResult.usedLlm,
              extractionMethod: extraction.extractionMethod,
              invoiceAction,
              existingInvoiceId: existingInvoice.id,
            };

            return res.json({
              ok: true,
              jobId: job.id,
              steps,
              message: "Invoice already exists - reused existing record",
              invoiceId: invoice.id,
              invoiceAction,
              lineItemCount: 0, // Not re-inserted
              invoice: {
                id: invoice.id,
                total: invoice.total,
                vendor: invoice.vendor,
                invoiceNumber: invoice.invoiceNumber,
                invoiceDate: invoice.invoiceDate,
              },
              usedLlm: extractionResult.usedLlm,
              totalDuration: Date.now() - startTime,
            });
          }
        } else {
          // No existing invoice found - create new one
          // 4. RACE-CONDITION SAFE INSERT: Try insert -> catch unique violation -> fallback to fetch
          console.log(`[persist] Dedupe miss: creating new invoice for invoiceNumber=${rawInvoiceNumber} (norm=${invoiceNumberNorm})`);

          try {
            invoice = await storage.createInvoice({
              companyId: job.companyId,
              projectId: null, // Can be assigned later via project matching
              vendorId,
              vendor: vendorName,
              invoiceNumber: rawInvoiceNumber,
              invoiceNumberNorm, // Normalized for dedupe
              invoiceDate,
              dueDate: extraction.dueDate,
              customerPo: extraction.customerPo,
              jobName: extraction.jobName,
              subtotal: extraction.subtotal?.toFixed(2) || null,
              tax: extraction.tax?.toFixed(2) || null,
              shipping: extraction.shipping?.toFixed(2) || null,
              total: invoiceTotal.toFixed(2),
              totalConfidence: extraction.totalConfidence.toFixed(2),
              vendorConfidence: extraction.vendorConfidence.toFixed(2),
              extractionMethod: extraction.extractionMethod,
              reconciliationDelta: reconciliationDelta?.toFixed(2) || null,
              status: invoiceStatus,
              sourceJobId: job.id,
              sourceRef: job.fileUrl || null,
            } as any);
            console.log(`[persist] Inserted new invoiceId=${invoice.id}`);
          } catch (insertError) {
            // Handle race condition: another request inserted the same invoice
            if (isUniqueViolationError(insertError)) {
              console.log(`[persist] Race condition: unique constraint violation, fetching existing invoice`);
              const raceExisting = await storage.findInvoiceByDedupeKey(
                dedupeKey.companyId,
                dedupeKey.invoiceNumberNorm,
                dedupeKey.invoiceDate,
                dedupeKey.total
              );
              if (raceExisting) {
                invoice = raceExisting;
                invoiceAction = "reused";
                console.log(`[persist] Race resolved: reusing existing invoiceId=${invoice.id}`);
              } else {
                // Shouldn't happen, but re-throw if we can't find the conflicting record
                throw insertError;
              }
            } else {
              throw insertError;
            }
          }
        }

        console.log(`[persist] Invoice ${invoiceAction}: id=${invoice.id}, total=$${invoiceTotal}`);

        // ========== LINE ITEMS: Use LLM items if available, otherwise deterministic ==========
        const deterministicLineItems = categorized.lineItems || [];
        const llmLineItems = extractionResult.llmLineItems || [];

        // Prefer LLM line items if we used LLM and it returned items
        // Otherwise fall back to deterministic extraction
        let sourceLineItems: any[] = [];
        let lineItemSource = "none";

        if (llmLineItems.length > 0) {
          sourceLineItems = llmLineItems;
          lineItemSource = "llm";
          console.log(`[run-single] Using ${llmLineItems.length} line items from LLM extraction`);
        } else if (deterministicLineItems.length > 0) {
          sourceLineItems = deterministicLineItems;
          lineItemSource = "deterministic";
          console.log(`[run-single] Using ${deterministicLineItems.length} line items from deterministic extraction`);
        } else {
          console.log(`[run-single] No line items from either LLM or deterministic extraction`);
        }

        let createdLineItems: any[] = [];

        if (sourceLineItems.length > 0) {
          // Helper to safely convert to number
          const toNumber = (val: any): number | null => {
            if (val === null || val === undefined) return null;
            if (typeof val === "number") return val;
            if (typeof val === "string") {
              const cleaned = val.replace(/[$,\s]/g, "").trim();
              const num = parseFloat(cleaned);
              return isNaN(num) ? null : num;
            }
            return null;
          };

          // Prepare line item inserts with normalization
          const lineItemInserts: any[] = [];
          const skippedItems: any[] = [];

          for (const li of sourceLineItems) {
            // Normalize lineAmount (accept both lineAmount and amount)
            let lineAmount = toNumber(li.lineAmount) ?? toNumber(li.amount);

            // If no lineAmount, try to compute from quantity * unitPrice
            if (lineAmount === null) {
              const qty = toNumber(li.quantity);
              const price = toNumber(li.unitPrice);
              if (qty !== null && price !== null) {
                lineAmount = qty * price;
              }
            }

            const description = li.description || li.productCode || "Unknown item";

            // Validation: require description AND (lineAmount OR computable amount)
            if (!description || description === "Unknown item") {
              skippedItems.push({ reason: "no_description", item: li });
              continue;
            }

            // Allow items without lineAmount if they have description (for line item tracking)
            const insert = {
              invoiceId: invoice.id,
              companyId: job.companyId,
              productCode: li.productCode || null,
              description,
              quantity: toNumber(li.quantity)?.toString() || null,
              unit: li.unit || null,
              unitPrice: toNumber(li.unitPrice)?.toString() || null,
              lineAmount: lineAmount?.toFixed(2) || null,
              category: li.category || "misc",
              categoryConfidence: toNumber(li.categoryConfidence)?.toFixed(2) || "0.30",
              categoryReason: li.matchedKeyword ? `keyword: ${li.matchedKeyword}` : (li.categoryReason || lineItemSource),
              rawLine: li.rawLine || null,
            };

            lineItemInserts.push(insert);
          }

          if (skippedItems.length > 0) {
            console.warn(`[run-single] Skipped ${skippedItems.length} invalid line items:`,
              skippedItems.map(s => `${s.reason}: ${JSON.stringify(s.item).slice(0, 100)}`));
          }

          if (lineItemInserts.length > 0) {
            createdLineItems = await storage.createInvoiceLineItems(lineItemInserts);
            console.log(`[run-single] Created ${createdLineItems.length} line items for invoice ${invoice.id} (source: ${lineItemSource})`);
          } else {
            console.warn(`[run-single] LLM returned ${sourceLineItems.length} items but 0 were valid for insertion`);
          }
        }

        // Update job with final result pointers
        await storage.updateIngestionJobFinalResults(job.id, {
          finalCategorizedResultId: String(categorizedResultRecord!.id),
          finalParsedResultId: String(parsedResultRecord!.id),
        });

        // Clear review fields and mark completed
        await storage.updateIngestionJobReviewFields(job.id, {
          needsReview: false,
          reviewReason: null,
          reviewStatus: "approved",
        });
        await storage.updateIngestionJobStatus(job.id, "completed");

        steps["persist-ledger"] = {
          status: "persisted",
          duration: Date.now() - stepStart,
          usedLlm: extractionResult.usedLlm,
          extractionMethod: extraction.extractionMethod,
          invoiceAction,
        };

        const actionMessage = invoiceAction === "created"
          ? "Pipeline completed - invoice created"
          : "Pipeline completed - invoice updated (forceReprocess)";

        return res.json({
          ok: true,
          jobId: job.id,
          steps,
          message: actionMessage,
          invoiceId: invoice.id,
          invoiceAction,
          lineItemCount: createdLineItems.length,
          invoice: {
            id: invoice.id,
            total: invoice.total,
            totalConfidence: extraction.totalConfidence,
            vendor: vendorName,
            vendorConfidence: extraction.vendorConfidence,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            finalConfidence,
            extractionMethod: extraction.extractionMethod,
          },
          usedLlm: extractionResult.usedLlm,
          fallbackReasons: extractionResult.fallbackReasons,
          llmMetrics: extractionResult.llmMetrics,
          totalDuration: Date.now() - startTime,
        });
      } catch (err: any) {
        console.error("[run-single] persist-ledger error:", err?.message);
        steps["persist-ledger"] = { status: "error", error: err?.message, duration: Date.now() - stepStart };

        // Return 400 for validation errors (e.g., missing invoice number)
        const statusCode = err instanceof InvoiceNumberRequiredError ? 400 : 500;
        const errorLabel = err instanceof InvoiceNumberRequiredError ? "Validation failed" : "Persistence failed";

        return res.status(statusCode).json({
          ok: false,
          jobId: job.id,
          steps,
          error: errorLabel,
          message: err?.message,
          totalDuration: Date.now() - startTime,
        });
      }
    } else {
      // skipPersist=true - just mark ready without persisting
      steps["persist-ledger"] = { status: "skipped" };

      await storage.updateIngestionJobStatus(job.id, "completed");
      await storage.updateIngestionJobFinalResults(job.id, {
        finalCategorizedResultId: String(categorizedResultRecord!.id),
        finalParsedResultId: String(parsedResultRecord!.id),
      });

      const categorized = (categorizedResultRecord!.extractedJson as any).categorized;
      return res.json({
        ok: true,
        jobId: job.id,
        steps,
        message: "Pipeline completed (skipPersist=true, not persisted)",
        summary: {
          vendor: categorized?.vendorOrClient,
          docType: categorized?.docType,
          lineItemCount: categorized?.lineItems?.length || 0,
        },
        totalDuration: Date.now() - startTime,
      });
    }
  } catch (error: any) {
    console.error("run-single error:", error);
    return res.status(500).json({
      ok: false,
      error: "Pipeline failed",
      message: error?.message,
      steps,
      totalDuration: Date.now() - startTime,
    });
  }
});

// ========== PROJECT REPORT ENDPOINTS ==========

// GET /api/projects/:id/summary - Project cost summary with material categories
app.get("/api/projects/:id/summary", async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const summary = await storage.getProjectMaterialsSummary(projectId);

    return res.json({
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        externalRef: (project as any).externalRef,
        status: project.status,
      },
      summary: {
        totalMaterials: summary.totalMaterials,
        totalLabor: summary.totalLabor,
        totalCost: summary.totalMaterials + summary.totalLabor,
        spendByCategory: summary.spendByCategory,
        topVendors: summary.topVendors,
        invoiceCount: summary.invoiceCount,
        lineItemCount: summary.lineItemCount,
      },
    });
  } catch (err: any) {
    console.error("project summary error:", err);
    return res.status(500).json({ message: "Server error", error: err?.message });
  }
});

// GET /api/projects/:id/line-items - List line items with filters
app.get("/api/projects/:id/line-items", async (req, res) => {
  try {
    const projectId = req.params.id;
    const { category, vendor, q, page = "1", limit = "100" } = req.query;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get line items for this project
    let lineItems = await storage.getLineItemsByProject(projectId, {
      category: category as string | undefined,
      vendor: vendor as string | undefined,
    });

    // Filter by search query if provided
    if (q && typeof q === "string") {
      const query = q.toLowerCase();
      lineItems = lineItems.filter(li =>
        (li.description || "").toLowerCase().includes(query) ||
        (li.productCode || "").toLowerCase().includes(query)
      );
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string) || 100));
    const offset = (pageNum - 1) * limitNum;
    const totalCount = lineItems.length;
    const paginatedItems = lineItems.slice(offset, offset + limitNum);

    return res.json({
      ok: true,
      projectId,
      lineItems: paginatedItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (err: any) {
    console.error("project line-items error:", err);
    return res.status(500).json({ message: "Server error", error: err?.message });
  }
});

// GET /api/projects/:id/line-items/export - Export line items as CSV
app.get("/api/projects/:id/line-items/export", async (req, res) => {
  try {
    const projectId = req.params.id;
    const { category, vendor, format = "csv" } = req.query;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get all line items for this project (with filters)
    const lineItems = await storage.getLineItemsByProject(projectId, {
      category: category as string | undefined,
      vendor: vendor as string | undefined,
    });

    // Get invoice details for each line item
    const invoiceCache: Record<string, any> = {};
    for (const li of lineItems) {
      if (li.invoiceId && !invoiceCache[li.invoiceId]) {
        invoiceCache[li.invoiceId] = await storage.getInvoice(li.invoiceId);
      }
    }

    if (format === "json") {
      // Return enriched JSON
      const enrichedItems = lineItems.map(li => ({
        ...li,
        invoice: invoiceCache[li.invoiceId] ? {
          invoiceNumber: invoiceCache[li.invoiceId].invoiceNumber,
          invoiceDate: invoiceCache[li.invoiceId].invoiceDate,
          vendor: invoiceCache[li.invoiceId].vendor,
        } : null,
      }));
      return res.json({
        ok: true,
        projectId,
        projectName: project.name,
        exportedAt: new Date().toISOString(),
        count: enrichedItems.length,
        lineItems: enrichedItems,
      });
    }

    // CSV export
    const csvRows: string[] = [];

    // Header
    csvRows.push([
      "Invoice Number",
      "Invoice Date",
      "Vendor",
      "Product Code",
      "Description",
      "Quantity",
      "Unit",
      "Line Amount",
      "Category",
      "Category Confidence",
    ].map(h => `"${h}"`).join(","));

    // Data rows
    for (const li of lineItems) {
      const inv = invoiceCache[li.invoiceId] || {};
      const row = [
        inv.invoiceNumber || "",
        inv.invoiceDate || "",
        inv.vendor || "",
        li.productCode || "",
        (li.description || "").replace(/"/g, '""'),
        li.quantity || "",
        li.unit || "",
        li.lineAmount || "",
        li.category || "",
        li.categoryConfidence || "",
      ].map(v => `"${v}"`).join(",");
      csvRows.push(row);
    }

    const csv = csvRows.join("\n");
    const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_line_items_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("project line-items export error:", err);
    return res.status(500).json({ message: "Server error", error: err?.message });
  }
});

// GET /api/projects/:id/invoices - List invoices for a project
app.get("/api/projects/:id/invoices", async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const invoicesList = await storage.getInvoicesByCompany(project.companyId, { projectId });

    return res.json({
      ok: true,
      projectId,
      invoices: invoicesList.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        vendor: inv.vendor,
        total: inv.total,
        subtotal: inv.subtotal,
        tax: inv.tax,
        totalConfidence: inv.totalConfidence,
        vendorConfidence: inv.vendorConfidence,
        createdAt: inv.createdAt,
      })),
      count: invoicesList.length,
    });
  } catch (err: any) {
    console.error("project invoices error:", err);
    return res.status(500).json({ message: "Server error", error: err?.message });
  }
});

// ========== INVOICE REVIEW ENDPOINTS ==========

// GET /api/invoices - List invoices with filters (status, companyId, projectId, vendorId, dateRange)
app.get("/api/invoices", async (req, res) => {
  try {
    const { companyId, status, projectId, vendorId, startDate, endDate, limit = "50", offset = "0" } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: "companyId query parameter is required" });
    }

    const company = await storage.getCompany(companyId as string);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const invoicesList = await storage.getInvoicesByCompany(companyId as string, {
      status: status as string | undefined,
      projectId: projectId as string | undefined,
      vendorId: vendorId as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
    });

    // Simple pagination
    const limitNum = Math.min(parseInt(limit as string) || 50, 500);
    const offsetNum = parseInt(offset as string) || 0;
    const paginatedInvoices = invoicesList.slice(offsetNum, offsetNum + limitNum);

    return res.json({
      ok: true,
      invoices: paginatedInvoices.map(inv => ({
        id: inv.id,
        companyId: inv.companyId,
        projectId: inv.projectId,
        vendorId: inv.vendorId,
        vendor: inv.vendor,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        total: inv.total,
        subtotal: inv.subtotal,
        tax: inv.tax,
        status: inv.status,
        reconciliationDelta: inv.reconciliationDelta,
        totalConfidence: inv.totalConfidence,
        vendorConfidence: inv.vendorConfidence,
        extractionMethod: inv.extractionMethod,
        createdAt: inv.createdAt,
      })),
      total: invoicesList.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (err: any) {
    console.error("GET /api/invoices error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// GET /api/invoices/:id - Get invoice details with line items
app.get("/api/invoices/:id", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const invoice = await storage.getInvoice(invoiceId);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Get line items
    const lineItems = await storage.getInvoiceLineItems(invoiceId);

    // Get project if assigned
    let project = null;
    if (invoice.projectId) {
      project = await storage.getProject(invoice.projectId);
    }

    // Get vendor if assigned
    let vendorRecord = null;
    if (invoice.vendorId) {
      const vendors = await storage.getVendors(invoice.companyId);
      vendorRecord = vendors.find(v => v.id === invoice.vendorId);
    }

    return res.json({
      ok: true,
      invoice: {
        ...invoice,
        project: project ? { id: project.id, name: project.name, externalRef: (project as any).externalRef } : null,
        vendorRecord: vendorRecord ? { id: vendorRecord.id, name: vendorRecord.name } : null,
      },
      lineItems: lineItems.map(li => ({
        id: li.id,
        productCode: li.productCode,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitPrice,
        lineAmount: li.lineAmount,
        category: li.category,
        categoryConfidence: li.categoryConfidence,
        categoryReason: li.categoryReason,
        rawLine: li.rawLine,
      })),
      lineItemCount: lineItems.length,
    });
  } catch (err: any) {
    console.error("GET /api/invoices/:id error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// PATCH /api/invoices/:id - Update invoice fields
app.patch("/api/invoices/:id", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const invoice = await storage.getInvoice(invoiceId);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Allowed fields for update
    const { vendor, invoiceNumber, invoiceDate, total, subtotal, tax, shipping, projectId, status } = req.body;

    const updateData: any = {};
    if (vendor !== undefined) updateData.vendor = vendor;
    if (invoiceNumber !== undefined) {
      updateData.invoiceNumber = invoiceNumber;
      // Also update normalized version
      const { normalizeInvoiceNumber } = await import("./invoiceUtils");
      updateData.invoiceNumberNorm = normalizeInvoiceNumber(invoiceNumber);
    }
    if (invoiceDate !== undefined) updateData.invoiceDate = invoiceDate;
    if (total !== undefined) updateData.total = total;
    if (subtotal !== undefined) updateData.subtotal = subtotal;
    if (tax !== undefined) updateData.tax = tax;
    if (shipping !== undefined) updateData.shipping = shipping;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (status !== undefined) {
      // Validate status
      const validStatuses = ["parsed_ok", "needs_review", "approved", "rejected"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      }
      updateData.status = status;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await storage.updateInvoice(invoiceId, updateData);

    return res.json({
      ok: true,
      message: "Invoice updated",
      invoice: updated,
    });
  } catch (err: any) {
    console.error("PATCH /api/invoices/:id error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// POST /api/invoices/:id/approve - Approve an invoice after review
app.post("/api/invoices/:id/approve", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const invoice = await storage.getInvoice(invoiceId);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (invoice.status === "approved") {
      return res.json({ ok: true, message: "Invoice already approved", invoice });
    }

    const updated = await storage.updateInvoice(invoiceId, { status: "approved" });

    return res.json({
      ok: true,
      message: "Invoice approved",
      invoice: updated,
    });
  } catch (err: any) {
    console.error("POST /api/invoices/:id/approve error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// POST /api/invoices/:id/reject - Reject an invoice
app.post("/api/invoices/:id/reject", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { reason } = req.body;

    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const updated = await storage.updateInvoice(invoiceId, { status: "rejected" });

    return res.json({
      ok: true,
      message: "Invoice rejected",
      reason: reason || null,
      invoice: updated,
    });
  } catch (err: any) {
    console.error("POST /api/invoices/:id/reject error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// PATCH /api/invoices/:invoiceId/line-items/:lineItemId - Update a line item (mainly for category correction)
app.patch("/api/invoices/:invoiceId/line-items/:lineItemId", async (req, res) => {
  try {
    const { invoiceId, lineItemId } = req.params;
    const { category, description, quantity, unitPrice, lineAmount } = req.body;

    // Verify invoice exists
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Build update
    const updateData: any = {};
    if (category !== undefined) {
      updateData.category = category;
      updateData.categoryConfidence = "1.00"; // Manual override = high confidence
      updateData.categoryReason = "manual_override";
    }
    if (description !== undefined) updateData.description = description;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (unitPrice !== undefined) updateData.unitPrice = unitPrice;
    if (lineAmount !== undefined) updateData.lineAmount = lineAmount;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // Update line item directly in DB
    const { db } = await import("./db");
    const { invoiceLineItems } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const result = await db
      .update(invoiceLineItems)
      .set(updateData)
      .where(eq(invoiceLineItems.id, lineItemId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: "Line item not found" });
    }

    return res.json({
      ok: true,
      message: "Line item updated",
      lineItem: result[0],
    });
  } catch (err: any) {
    console.error("PATCH line-item error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// GET /api/projects/:id/cost-report - Combined cost report (materials + labor by category)
app.get("/api/projects/:id/cost-report", async (req, res) => {
  try {
    const projectId = req.params.id;
    const { format = "json" } = req.query;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get material costs from invoices/line items
    const materialSummary = await storage.getProjectMaterialsSummary(projectId);

    // Get labor entries for this project
    const laborEntries = await storage.getLaborEntries(project.companyId, { projectId });

    // Aggregate labor by worker and role
    const laborByWorker: Record<string, { hours: number; cost: number; roles: Set<string> }> = {};
    const laborByRole: Record<string, { hours: number; cost: number }> = {};
    let totalLaborHours = 0;
    let totalLaborCost = 0;

    for (const entry of laborEntries) {
      const hours = parseFloat(entry.hours || "0");
      const rate = parseFloat(entry.rate || "0");
      const cost = hours * rate;
      const worker = entry.workerName || "Unknown";
      const role = entry.role || "General";

      totalLaborHours += hours;
      totalLaborCost += cost;

      if (!laborByWorker[worker]) {
        laborByWorker[worker] = { hours: 0, cost: 0, roles: new Set() };
      }
      laborByWorker[worker].hours += hours;
      laborByWorker[worker].cost += cost;
      laborByWorker[worker].roles.add(role);

      if (!laborByRole[role]) {
        laborByRole[role] = { hours: 0, cost: 0 };
      }
      laborByRole[role].hours += hours;
      laborByRole[role].cost += cost;
    }

    const report = {
      project: {
        id: project.id,
        name: project.name,
        externalRef: (project as any).externalRef,
        status: project.status,
      },
      summary: {
        totalMaterialCost: materialSummary.totalMaterials,
        totalLaborCost,
        totalLaborHours,
        totalCost: materialSummary.totalMaterials + totalLaborCost,
        invoiceCount: materialSummary.invoiceCount,
        lineItemCount: materialSummary.lineItemCount,
        laborEntryCount: laborEntries.length,
      },
      materials: {
        byCategory: materialSummary.spendByCategory,
        topVendors: materialSummary.topVendors,
      },
      labor: {
        byWorker: Object.entries(laborByWorker).map(([name, data]) => ({
          worker: name,
          hours: data.hours,
          cost: data.cost,
          roles: Array.from(data.roles),
        })),
        byRole: Object.entries(laborByRole).map(([role, data]) => ({
          role,
          hours: data.hours,
          cost: data.cost,
        })),
      },
      generatedAt: new Date().toISOString(),
    };

    if (format === "csv") {
      // Generate CSV export
      const csvRows: string[] = [];

      // Summary section
      csvRows.push("=== PROJECT COST REPORT ===");
      csvRows.push(`Project,${project.name}`);
      csvRows.push(`Total Material Cost,$${materialSummary.totalMaterials.toFixed(2)}`);
      csvRows.push(`Total Labor Cost,$${totalLaborCost.toFixed(2)}`);
      csvRows.push(`Total Cost,$${(materialSummary.totalMaterials + totalLaborCost).toFixed(2)}`);
      csvRows.push("");

      // Materials by category
      csvRows.push("=== MATERIALS BY CATEGORY ===");
      csvRows.push("Category,Amount");
      for (const [cat, amount] of Object.entries(materialSummary.spendByCategory)) {
        csvRows.push(`${cat},$${(amount as number).toFixed(2)}`);
      }
      csvRows.push("");

      // Top vendors
      csvRows.push("=== TOP VENDORS ===");
      csvRows.push("Vendor,Total");
      for (const v of materialSummary.topVendors) {
        csvRows.push(`"${v.vendor}",$${v.total.toFixed(2)}`);
      }
      csvRows.push("");

      // Labor by worker
      csvRows.push("=== LABOR BY WORKER ===");
      csvRows.push("Worker,Hours,Cost,Roles");
      for (const [name, data] of Object.entries(laborByWorker)) {
        csvRows.push(`"${name}",${data.hours.toFixed(2)},$${data.cost.toFixed(2)},"${Array.from(data.roles).join("; ")}"`);
      }
      csvRows.push("");

      // Labor by role
      csvRows.push("=== LABOR BY ROLE ===");
      csvRows.push("Role,Hours,Cost");
      for (const [role, data] of Object.entries(laborByRole)) {
        csvRows.push(`"${role}",${data.hours.toFixed(2)},$${data.cost.toFixed(2)}`);
      }

      const csv = csvRows.join("\n");
      const filename = `cost_report_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    return res.json({ ok: true, ...report });
  } catch (err: any) {
    console.error("GET /api/projects/:id/cost-report error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// ========== V2 EXTRACTION - MULTI-INVOICE SUPPORT ==========
app.post("/api/ingestion/jobs/:id/process-v2", async (req, res) => {
  try {
    const token = req.header("x-ingest-token");
    if (!process.env.INGEST_API_TOKEN || token !== process.env.INGEST_API_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await storage.getIngestionJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Get OCR text from job results
    const results = await storage.getIngestionResults(job.id);
    let ocrText = "";

    for (const r of results) {
      if (r.rawText) ocrText += r.rawText + "\n\n";
      const json = r.extractedJson as any;
      if (json?.ocr) {
        for (const doc of Object.values(json.ocr) as any[]) {
          if (doc.text) ocrText += doc.text + "\n\n";
        }
      }
    }

    // If no OCR text yet, try to run OCR first
    if (!ocrText.trim()) {
      // Get file from S3 and run Textract
      if (!job.fileUrl) {
        return res.status(400).json({ error: "No file URL on job" });
      }

      const { textractSmartOCR } = await import("./textract");
      const { bucket, key } = parseS3Url(job.fileUrl);
      const textractResult = await textractSmartOCR(bucket, key);
      ocrText = textractResult.text || "";

      // Save OCR result
      await storage.createIngestionResult({
        ingestionJobId: job.id,
        rawText: ocrText,
        extractedJson: { ocr: { [key]: { text: ocrText, pageCount: textractResult.pageCount } } },
        status: "ocr_complete",
        confidenceScore: textractResult.confidence?.toString() || null,
      });
    }

    if (!ocrText.trim()) {
      return res.status(400).json({ error: "No OCR text available" });
    }

    // Run V2 extraction
    const { extractAllInvoices, matchJobToProject } = await import("./invoiceExtractV2");
    const extractionResult = await extractAllInvoices(ocrText);

    if (!extractionResult.success) {
      return res.status(500).json({ error: "Extraction failed", message: extractionResult.error });
    }

    // Get company projects for matching
    const projects = await storage.getProjects(job.companyId);

    // Save each extracted invoice to database
    const savedInvoices: any[] = [];

    for (const inv of extractionResult.invoices) {
      // Match to project
      const projectId = matchJobToProject(inv.jobName, inv.shipToAddress, projects);

      // Find or create vendor
      let vendorId: string | null = null;
      const existingVendors = await storage.getVendors(job.companyId);
      const normalizedVendor = inv.vendor.toLowerCase().trim();
      const matchedVendor = existingVendors.find(v =>
        v.normalizedName === normalizedVendor || v.name.toLowerCase() === normalizedVendor
      );

      if (matchedVendor) {
        vendorId = matchedVendor.id;
      } else {
        const newVendor = await storage.createVendor({
          companyId: job.companyId,
          name: inv.vendor,
          normalizedName: normalizedVendor,
        });
        vendorId = newVendor.id;
      }

      // Create invoice
      const savedInvoice = await storage.createInvoice({
        companyId: job.companyId,
        projectId,
        vendorId,
        vendor: inv.vendor,
        invoiceNumber: inv.invoiceNumber,
        invoiceNumberNorm: inv.invoiceNumber.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        customerPo: inv.customerPo,
        jobName: inv.jobName,
        subtotal: inv.subtotal.toString(),
        tax: inv.tax.toString(),
        shipping: inv.shipping?.toString() || null,
        total: inv.total.toString(),
        totalConfidence: "0.90",
        vendorConfidence: "0.90",
        extractionMethod: "llm_v2",
        status: "parsed_ok",
        reconciliationDelta: Math.abs(inv.subtotal + inv.tax + (inv.shipping || 0) - inv.total).toFixed(2),
        sourceJobId: job.id,
        sourceRef: job.fileUrl,
      });

      // Create line items (batch insert)
      if (inv.lineItems.length > 0) {
        const lineItemsToInsert = inv.lineItems.map((li) => ({
          invoiceId: savedInvoice.id,
          companyId: job.companyId,
          productCode: li.productCode,
          description: li.description || "Unknown item",
          quantity: li.quantity?.toString() || null,
          unit: li.unit,
          unitPrice: li.unitPrice?.toString() || null,
          lineAmount: li.lineAmount?.toString() || null,
          category: li.category,
          categoryConfidence: li.categoryConfidence.toString(),
          categoryReason: "v2_categorizer",
        }));
        await storage.createInvoiceLineItems(lineItemsToInsert);
      }

      savedInvoices.push({
        id: savedInvoice.id,
        invoiceNumber: inv.invoiceNumber,
        vendor: inv.vendor,
        total: inv.total,
        lineItemCount: inv.lineItems.length,
        projectId,
        projectName: projects.find(p => p.id === projectId)?.name || null,
      });
    }

    // Update job status
    await storage.updateIngestionJobStatus(job.id, "completed");

    return res.json({
      ok: true,
      jobId: job.id,
      invoicesExtracted: extractionResult.invoices.length,
      totalLineItems: extractionResult.invoices.reduce((sum, i) => sum + i.lineItems.length, 0),
      savedInvoices,
    });

  } catch (err: any) {
    console.error("POST /api/ingestion/jobs/:id/process-v2 error:", err);
    return res.status(500).json({ error: "Server error", message: err?.message });
  }
});

// ========== PROJECT BUDGETS (TAKEOFFS) ==========

// Create a budget for a project
app.post("/api/projects/:projectId/budgets", async (req, res) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { name, contractValue, estimatedCost, notes, lineItems } = req.body;

    if (!contractValue) {
      return res.status(400).json({ error: "contractValue is required" });
    }

    const estCost = parseFloat(estimatedCost || "0");
    const contract = parseFloat(contractValue);
    const estimatedProfit = contract - estCost;
    const estimatedMargin = contract > 0 ? (estimatedProfit / contract) * 100 : 0;

    const budget = await storage.createProjectBudget({
      projectId: project.id,
      companyId: project.companyId,
      name: name || "Original Estimate",
      contractValue: contractValue.toString(),
      estimatedCost: estCost.toString(),
      estimatedProfit: estimatedProfit.toString(),
      estimatedMargin: estimatedMargin.toFixed(2),
      notes,
      status: "active",
    });

    // Create line items if provided
    if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
      const itemsToInsert = lineItems.map((li: any) => ({
        budgetId: budget.id,
        companyId: project.companyId,
        category: li.category || "misc",
        description: li.description || "Budget item",
        quantity: li.quantity?.toString() || null,
        unit: li.unit || null,
        unitCost: li.unitCost?.toString() || null,
        totalCost: (li.totalCost || 0).toString(),
        notes: li.notes || null,
      }));
      await storage.createBudgetLineItems(itemsToInsert);
    }

    res.json({ ok: true, budget });
  } catch (err: any) {
    console.error("POST /api/projects/:projectId/budgets error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get all budgets for a project
app.get("/api/projects/:projectId/budgets", async (req, res) => {
  try {
    const budgets = await storage.getProjectBudgets(req.params.projectId);
    res.json({ ok: true, budgets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get budget with line items
app.get("/api/budgets/:budgetId", async (req, res) => {
  try {
    const budget = await storage.getProjectBudget(req.params.budgetId);
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const lineItems = await storage.getBudgetLineItems(budget.id);
    res.json({ ok: true, budget, lineItems });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update budget
app.patch("/api/budgets/:budgetId", async (req, res) => {
  try {
    const budget = await storage.updateProjectBudget(req.params.budgetId, req.body);
    res.json({ ok: true, budget });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete budget
app.delete("/api/budgets/:budgetId", async (req, res) => {
  try {
    await storage.deleteProjectBudget(req.params.budgetId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== BUDGET LINE ITEMS ==========

// Add a single budget line item
app.post("/api/budgets/:budgetId/line-items", async (req, res) => {
  try {
    const budget = await storage.getProjectBudget(req.params.budgetId);
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const { category, description, quantity, unit, unitCost, totalCost, notes } = req.body;

    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }

    const qty = parseFloat(quantity || "0");
    const uCost = parseFloat(unitCost || "0");
    const calculatedTotal = totalCost ? parseFloat(totalCost) : qty * uCost;

    const items = await storage.createBudgetLineItems([{
      budgetId: budget.id,
      companyId: budget.companyId,
      category: category || "misc",
      description,
      quantity: qty > 0 ? qty.toString() : null,
      unit: unit || null,
      unitCost: uCost > 0 ? uCost.toString() : null,
      totalCost: calculatedTotal.toString(),
      notes: notes || null,
    }]);

    // Recalculate budget totals
    const allItems = await storage.getBudgetLineItems(budget.id);
    const estimatedCost = allItems.reduce((sum, item) => sum + parseFloat(item.totalCost || "0"), 0);
    const contractValue = parseFloat(budget.contractValue || "0");
    const estimatedProfit = contractValue - estimatedCost;
    const estimatedMargin = contractValue > 0 ? (estimatedProfit / contractValue) * 100 : 0;

    await storage.updateProjectBudget(budget.id, {
      estimatedCost: estimatedCost.toString(),
      estimatedProfit: estimatedProfit.toString(),
      estimatedMargin: estimatedMargin.toFixed(2),
    });

    res.json({ ok: true, lineItem: items[0] });
  } catch (err: any) {
    console.error("POST /api/budgets/:budgetId/line-items error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update a budget line item
app.patch("/api/budget-line-items/:id", async (req, res) => {
  try {
    const { category, description, quantity, unit, unitCost, totalCost, notes } = req.body;

    const qty = quantity !== undefined ? parseFloat(quantity || "0") : undefined;
    const uCost = unitCost !== undefined ? parseFloat(unitCost || "0") : undefined;

    // Calculate totalCost if qty and unitCost are provided
    let calculatedTotal = totalCost !== undefined ? parseFloat(totalCost) : undefined;
    if (calculatedTotal === undefined && qty !== undefined && uCost !== undefined) {
      calculatedTotal = qty * uCost;
    }

    const updateData: any = {};
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (qty !== undefined) updateData.quantity = qty > 0 ? qty.toString() : null;
    if (unit !== undefined) updateData.unit = unit || null;
    if (uCost !== undefined) updateData.unitCost = uCost > 0 ? uCost.toString() : null;
    if (calculatedTotal !== undefined) updateData.totalCost = calculatedTotal.toString();
    if (notes !== undefined) updateData.notes = notes || null;

    const lineItem = await storage.updateBudgetLineItem(req.params.id, updateData);

    // Recalculate budget totals
    const budget = await storage.getProjectBudget(lineItem.budgetId);
    if (budget) {
      const allItems = await storage.getBudgetLineItems(budget.id);
      const estimatedCost = allItems.reduce((sum, item) => sum + parseFloat(item.totalCost || "0"), 0);
      const contractValue = parseFloat(budget.contractValue || "0");
      const estimatedProfit = contractValue - estimatedCost;
      const estimatedMargin = contractValue > 0 ? (estimatedProfit / contractValue) * 100 : 0;

      await storage.updateProjectBudget(budget.id, {
        estimatedCost: estimatedCost.toString(),
        estimatedProfit: estimatedProfit.toString(),
        estimatedMargin: estimatedMargin.toFixed(2),
      });
    }

    res.json({ ok: true, lineItem });
  } catch (err: any) {
    console.error("PATCH /api/budget-line-items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a budget line item
app.delete("/api/budget-line-items/:id", async (req, res) => {
  try {
    // Get the line item first to know which budget to recalculate
    const allBudgets = await storage.getProjectBudgets("");
    // We need the budget ID before deleting
    const lineItemId = req.params.id;

    // Delete the item
    await storage.deleteBudgetLineItem(lineItemId);

    res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/budget-line-items/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PAYMENT PHASES ==========

// Create payment phases for a project (typically 4: 25% each)
app.post("/api/projects/:projectId/payment-phases", async (req, res) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { phases } = req.body;

    if (!phases || !Array.isArray(phases)) {
      return res.status(400).json({ error: "phases array is required" });
    }

    const createdPhases = [];
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      const phase = await storage.createPaymentPhase({
        projectId: project.id,
        companyId: project.companyId,
        name: p.name || `Phase ${i + 1}`,
        percentage: (p.percentage || 25).toString(),
        amount: (p.amount || 0).toString(),
        sequenceOrder: (i + 1).toString(),
        description: p.description || null,
        status: "pending",
        dueDate: p.dueDate || null,
      });
      createdPhases.push(phase);
    }

    res.json({ ok: true, phases: createdPhases });
  } catch (err: any) {
    console.error("POST /api/projects/:projectId/payment-phases error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get payment phases for a project
app.get("/api/projects/:projectId/payment-phases", async (req, res) => {
  try {
    const phases = await storage.getPaymentPhases(req.params.projectId);

    // Get payment records for each phase
    const phasesWithPayments = await Promise.all(
      phases.map(async (phase) => {
        const payments = await storage.getPaymentRecords(phase.id);
        const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        return {
          ...phase,
          payments,
          totalPaid,
          remaining: parseFloat(phase.amount) - totalPaid,
        };
      })
    );

    res.json({ ok: true, phases: phasesWithPayments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update a payment phase (e.g., mark as invoiced)
app.patch("/api/payment-phases/:phaseId", async (req, res) => {
  try {
    const phase = await storage.updatePaymentPhase(req.params.phaseId, req.body);
    res.json({ ok: true, phase });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Record a payment received
app.post("/api/payment-phases/:phaseId/payments", async (req, res) => {
  try {
    const phase = await storage.getPaymentPhase(req.params.phaseId);
    if (!phase) return res.status(404).json({ error: "Phase not found" });

    const { amount, paymentDate, paymentMethod, referenceNumber, notes } = req.body;

    if (!amount || !paymentDate) {
      return res.status(400).json({ error: "amount and paymentDate are required" });
    }

    const payment = await storage.createPaymentRecord({
      phaseId: phase.id,
      projectId: phase.projectId,
      companyId: phase.companyId,
      amount: amount.toString(),
      paymentDate,
      paymentMethod: paymentMethod || null,
      referenceNumber: referenceNumber || null,
      notes: notes || null,
    });

    // Check if phase is fully paid and update status
    const allPayments = await storage.getPaymentRecords(phase.id);
    const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const phaseAmount = parseFloat(phase.amount);

    if (totalPaid >= phaseAmount) {
      await storage.updatePaymentPhase(phase.id, { status: "paid" });
    } else if (totalPaid > 0) {
      await storage.updatePaymentPhase(phase.id, { status: "partial" });
    }

    res.json({ ok: true, payment, totalPaid, phaseAmount });
  } catch (err: any) {
    console.error("POST /api/payment-phases/:phaseId/payments error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PROJECT FINANCIALS ==========

// Get financial summary for a single project
app.get("/api/projects/:projectId/financials", async (req, res) => {
  try {
    const financials = await storage.getProjectFinancials(req.params.projectId);
    res.json({ ok: true, financials });
  } catch (err: any) {
    console.error("GET /api/projects/:projectId/financials error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get financial summary for all projects in a company
app.get("/api/companies/:companyId/financials", async (req, res) => {
  try {
    const projectsFinancials = await storage.getCompanyProjectsFinancials(req.params.companyId);

    // Calculate company totals
    const totals = projectsFinancials.reduce(
      (acc, p) => ({
        totalContractValue: acc.totalContractValue + p.contractValue,
        totalEstimatedCost: acc.totalEstimatedCost + p.estimatedCost,
        totalCostsToDate: acc.totalCostsToDate + p.costsToDate,
        totalRevenueToDate: acc.totalRevenueToDate + p.revenueToDate,
        totalProfitToDate: acc.totalProfitToDate + p.profitToDate,
        totalOutstanding: acc.totalOutstanding + p.outstandingReceivables,
      }),
      {
        totalContractValue: 0,
        totalEstimatedCost: 0,
        totalCostsToDate: 0,
        totalRevenueToDate: 0,
        totalProfitToDate: 0,
        totalOutstanding: 0,
      }
    );

    const overallMargin = totals.totalRevenueToDate > 0
      ? (totals.totalProfitToDate / totals.totalRevenueToDate) * 100
      : 0;

    // Identify problem projects
    const problemProjects = projectsFinancials.filter(p => p.isOverBudget || p.isUnderperforming);

    res.json({
      ok: true,
      projects: projectsFinancials,
      totals: {
        ...totals,
        overallMargin,
        projectCount: projectsFinancials.length,
        problemProjectCount: problemProjects.length,
      },
      problemProjects,
    });
  } catch (err: any) {
    console.error("GET /api/companies/:companyId/financials error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== BUDGET VS ACTUAL COMPARISON ==========

// Compare actual spending against budget by category
app.get("/api/projects/:projectId/budget-vs-actual", async (req, res) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Get budget
    const budgets = await storage.getProjectBudgets(req.params.projectId);
    const activeBudget = budgets.find(b => b.status === "active") || budgets[0];

    if (!activeBudget) {
      return res.status(404).json({ error: "No budget found for this project" });
    }

    const budgetItems = await storage.getBudgetLineItems(activeBudget.id);

    // Get actual spending from invoice line items
    const lineItems = await storage.getLineItemsByProject(req.params.projectId);

    // Group actual by category
    const actualByCategory: Record<string, number> = {};
    for (const li of lineItems) {
      const cat = li.category || "misc";
      actualByCategory[cat] = (actualByCategory[cat] || 0) + parseFloat(li.lineAmount || "0");
    }

    // Build comparison
    const comparison = budgetItems.map((bi) => {
      const budgeted = parseFloat(bi.totalCost);
      const actual = actualByCategory[bi.category] || 0;
      const variance = budgeted - actual;
      const percentUsed = budgeted > 0 ? (actual / budgeted) * 100 : 0;

      return {
        category: bi.category,
        description: bi.description,
        budgeted,
        actual,
        variance,
        percentUsed,
        status: variance < 0 ? "over_budget" : variance < budgeted * 0.1 ? "near_limit" : "on_track",
      };
    });

    // Find categories with spending but no budget
    const budgetedCategories = new Set(budgetItems.map(b => b.category));
    const unbudgetedSpending = Object.entries(actualByCategory)
      .filter(([cat]) => !budgetedCategories.has(cat))
      .map(([category, actual]) => ({
        category,
        description: "Unbudgeted spending",
        budgeted: 0,
        actual,
        variance: -actual,
        percentUsed: 100,
        status: "unbudgeted",
      }));

    res.json({
      ok: true,
      projectName: project.name,
      budgetName: activeBudget.name,
      contractValue: parseFloat(activeBudget.contractValue),
      comparison: [...comparison, ...unbudgetedSpending].sort((a, b) => a.variance - b.variance),
      summary: {
        totalBudgeted: budgetItems.reduce((sum, b) => sum + parseFloat(b.totalCost), 0),
        totalActual: Object.values(actualByCategory).reduce((sum, v) => sum + v, 0),
        overBudgetCategories: comparison.filter(c => c.status === "over_budget").length,
        nearLimitCategories: comparison.filter(c => c.status === "near_limit").length,
      },
    });
  } catch (err: any) {
    console.error("GET /api/projects/:projectId/budget-vs-actual error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== GENERAL CONTRACTORS ==========

// Get all GCs for a company
app.get("/api/companies/:companyId/general-contractors", async (req, res) => {
  try {
    const gcs = await storage.getGeneralContractors(req.params.companyId);
    res.json({ ok: true, generalContractors: gcs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new GC
app.post("/api/companies/:companyId/general-contractors", async (req, res) => {
  try {
    const { name, contactName, phone, email, address, paymentTermsDays, invoiceDueDay, billingMethod, retentionPercent, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const gc = await storage.createGeneralContractor({
      companyId: req.params.companyId,
      name,
      contactName: contactName || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      paymentTermsDays: paymentTermsDays?.toString() || "45",
      invoiceDueDay: invoiceDueDay || null,
      billingMethod: billingMethod || "progress",
      retentionPercent: retentionPercent?.toString() || "10",
      notes: notes || null,
      status: "active",
    });

    res.json({ ok: true, generalContractor: gc });
  } catch (err: any) {
    console.error("POST /api/companies/:companyId/general-contractors error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get a specific GC
app.get("/api/general-contractors/:id", async (req, res) => {
  try {
    const gc = await storage.getGeneralContractor(req.params.id);
    if (!gc) return res.status(404).json({ error: "General contractor not found" });
    res.json({ ok: true, generalContractor: gc });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update a GC
app.patch("/api/general-contractors/:id", async (req, res) => {
  try {
    const gc = await storage.updateGeneralContractor(req.params.id, req.body);
    res.json({ ok: true, generalContractor: gc });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a GC
app.delete("/api/general-contractors/:id", async (req, res) => {
  try {
    await storage.deleteGeneralContractor(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CHANGE ORDERS ==========

// Get all change orders for a project
app.get("/api/projects/:projectId/change-orders", async (req, res) => {
  try {
    const changeOrders = await storage.getChangeOrders(req.params.projectId);

    // Calculate totals
    const totalApproved = changeOrders
      .filter(co => co.status === "approved" || co.status === "invoiced")
      .reduce((sum, co) => sum + parseFloat(co.amount), 0);
    const totalPending = changeOrders
      .filter(co => co.status === "pending")
      .reduce((sum, co) => sum + parseFloat(co.amount), 0);

    res.json({
      ok: true,
      changeOrders,
      summary: {
        total: changeOrders.length,
        totalApproved,
        totalPending,
        pendingCount: changeOrders.filter(co => co.status === "pending").length,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a change order
app.post("/api/projects/:projectId/change-orders", async (req, res) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { coNumber, description, amount, dateSubmitted, status, notes } = req.body;

    if (!coNumber || !amount) {
      return res.status(400).json({ error: "coNumber and amount are required" });
    }

    const co = await storage.createChangeOrder({
      companyId: project.companyId,
      projectId: project.id,
      gcId: project.gcId || null,
      coNumber,
      description: description || null,
      amount: amount.toString(),
      dateSubmitted: dateSubmitted || null,
      status: status || "pending",
      notes: notes || null,
    });

    res.json({ ok: true, changeOrder: co });
  } catch (err: any) {
    console.error("POST /api/projects/:projectId/change-orders error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update a change order
app.patch("/api/change-orders/:id", async (req, res) => {
  try {
    const co = await storage.updateChangeOrder(req.params.id, req.body);
    res.json({ ok: true, changeOrder: co });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a change order
app.delete("/api/change-orders/:id", async (req, res) => {
  try {
    await storage.deleteChangeOrder(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PROJECT INVOICES (Invoices TO GC) ==========

// Get all project invoices for a project
app.get("/api/projects/:projectId/project-invoices", async (req, res) => {
  try {
    const invoices = await storage.getProjectInvoices(req.params.projectId);

    // Get payments for each invoice
    const invoicesWithPayments = await Promise.all(
      invoices.map(async (inv) => {
        const payments = await storage.getPaymentsReceivedByInvoice(inv.id);
        const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const invoiceAmount = parseFloat(inv.amount);
        return {
          ...inv,
          payments,
          totalPaid,
          balance: invoiceAmount - totalPaid,
          isPaid: totalPaid >= invoiceAmount,
        };
      })
    );

    // Calculate totals
    const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
    const totalCollected = invoicesWithPayments.reduce((sum, inv) => sum + inv.totalPaid, 0);

    res.json({
      ok: true,
      invoices: invoicesWithPayments,
      summary: {
        totalInvoiced,
        totalCollected,
        outstanding: totalInvoiced - totalCollected,
        invoiceCount: invoices.length,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a project invoice
app.post("/api/projects/:projectId/project-invoices", async (req, res) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { invoiceNumber, invoiceDate, amount, percentBilled, cumulativePercent, includesChangeOrders, billingType, status, dueDate, submittedVia, notes, poNumber } = req.body;

    if (!invoiceNumber || !invoiceDate || !amount) {
      return res.status(400).json({ error: "invoiceNumber, invoiceDate, and amount are required" });
    }

    const invoice = await storage.createProjectInvoice({
      companyId: project.companyId,
      projectId: project.id,
      gcId: project.gcId || null,
      invoiceNumber,
      poNumber: poNumber || null,
      invoiceDate,
      amount: amount.toString(),
      percentBilled: percentBilled?.toString() || null,
      cumulativePercent: cumulativePercent?.toString() || null,
      includesChangeOrders: includesChangeOrders || null,
      billingType: billingType || "progress",
      status: status || "draft",
      dueDate: dueDate || null,
      submittedVia: submittedVia || null,
      notes: notes || null,
    });

    res.json({ ok: true, projectInvoice: invoice });
  } catch (err: any) {
    console.error("POST /api/projects/:projectId/project-invoices error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update a project invoice
app.patch("/api/project-invoices/:id", async (req, res) => {
  try {
    const invoice = await storage.updateProjectInvoice(req.params.id, req.body);
    res.json({ ok: true, projectInvoice: invoice });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a project invoice
app.delete("/api/project-invoices/:id", async (req, res) => {
  try {
    await storage.deleteProjectInvoice(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate invoice PDF
app.get("/api/project-invoices/:id/pdf", async (req, res) => {
  try {
    const { generateInvoicePDFById } = await import("./pdfGenerator");
    const { pdf, filename } = await generateInvoicePDFById(req.params.id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  } catch (err: any) {
    console.error("GET /api/project-invoices/:id/pdf error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Send invoice via email
app.post("/api/project-invoices/:id/send-email", async (req, res) => {
  try {
    const { to, recipientName } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Recipient email is required" });
    }

    // Get invoice details
    const invoice = await storage.getProjectInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const project = await storage.getProject(invoice.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const company = await storage.getCompany(project.companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Generate PDF
    const { generateInvoicePDFById } = await import("./pdfGenerator");
    const { pdf, filename } = await generateInvoicePDFById(req.params.id);

    // Prepare email
    const { emailService, getInvoiceEmailTemplate } = await import("./emailService");

    const formatCurrency = (val: string) => {
      const num = parseFloat(val);
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
    };

    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return undefined;
      return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    };

    const emailContent = getInvoiceEmailTemplate({
      companyName: company.name,
      invoiceNumber: invoice.invoiceNumber,
      amount: formatCurrency(invoice.amount),
      dueDate: formatDate(invoice.dueDate),
      projectName: project.name,
      recipientName,
    });

    // Send email
    const result = await emailService.send({
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      attachments: [
        {
          filename,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    if (result.success) {
      // Update invoice status if in draft
      if (invoice.status === "draft") {
        await storage.updateProjectInvoice(req.params.id, { status: "sent" });
      }
      res.json({ ok: true, messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error || "Failed to send email" });
    }
  } catch (err: any) {
    console.error("POST /api/project-invoices/:id/send-email error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PAYMENTS RECEIVED (From GC) ==========

// Get all payments for a project
app.get("/api/projects/:projectId/payments-received", async (req, res) => {
  try {
    const payments = await storage.getPaymentsReceived(req.params.projectId);
    const totalReceived = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    res.json({
      ok: true,
      payments,
      summary: {
        totalReceived,
        paymentCount: payments.length,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Record a payment received
app.post("/api/projects/:projectId/payments-received", async (req, res) => {
  try {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const { projectInvoiceId, amount, paymentDate, paymentMethod, referenceNumber, bankDeposited, notes } = req.body;

    if (!amount || !paymentDate) {
      return res.status(400).json({ error: "amount and paymentDate are required" });
    }

    const payment = await storage.createPaymentReceived({
      companyId: project.companyId,
      projectId: project.id,
      projectInvoiceId: projectInvoiceId || null,
      amount: amount.toString(),
      paymentDate,
      paymentMethod: paymentMethod || null,
      referenceNumber: referenceNumber || null,
      bankDeposited: bankDeposited || null,
      notes: notes || null,
    });

    // If linked to an invoice, update invoice status
    if (projectInvoiceId) {
      const invoicePayments = await storage.getPaymentsReceivedByInvoice(projectInvoiceId);
      const invoice = await storage.getProjectInvoice(projectInvoiceId);
      if (invoice) {
        const totalPaid = invoicePayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const invoiceAmount = parseFloat(invoice.amount);

        let newStatus = invoice.status;
        if (totalPaid >= invoiceAmount) {
          newStatus = "paid";
        } else if (totalPaid > 0) {
          newStatus = "partial";
        }

        if (newStatus !== invoice.status) {
          await storage.updateProjectInvoice(projectInvoiceId, { status: newStatus });
        }
      }
    }

    res.json({ ok: true, payment });
  } catch (err: any) {
    console.error("POST /api/projects/:projectId/payments-received error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a payment
app.delete("/api/payments-received/:id", async (req, res) => {
  try {
    await storage.deletePaymentReceived(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== UPDATE PROJECT TO LINK GC ==========

// Update project to link to GC and add financial info
app.patch("/api/projects/:id", async (req, res) => {
  try {
    const project = await storage.updateProject(req.params.id, req.body);
    res.json({ ok: true, project });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a project
app.delete("/api/projects/:id", async (req, res) => {
  try {
    await storage.deleteProject(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== WORKERS ==========

// Get all workers for a company
app.get("/api/companies/:companyId/workers", async (req, res) => {
  try {
    const workers = await storage.getWorkers(req.params.companyId);
    res.json({ ok: true, workers });
  } catch (err: any) {
    console.error("GET /api/companies/:companyId/workers error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create a worker
app.post("/api/companies/:companyId/workers", async (req, res) => {
  try {
    const worker = await storage.createWorker({
      ...req.body,
      companyId: req.params.companyId,
    });
    res.status(201).json({ ok: true, worker });
  } catch (err: any) {
    console.error("POST /api/companies/:companyId/workers error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get single worker
app.get("/api/workers/:id", async (req, res) => {
  try {
    const worker = await storage.getWorker(req.params.id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    res.json({ ok: true, worker });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update worker
app.patch("/api/workers/:id", async (req, res) => {
  try {
    const worker = await storage.updateWorker(req.params.id, req.body);
    res.json({ ok: true, worker });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete worker
app.delete("/api/workers/:id", async (req, res) => {
  try {
    await storage.deleteWorker(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PAYROLL ENTRIES ==========

// Get payroll entries for a company (with optional filters)
app.get("/api/companies/:companyId/payroll", async (req, res) => {
  try {
    const filters: { projectId?: string; workerId?: string; weekStart?: string; weekEnd?: string } = {};
    if (req.query.projectId) filters.projectId = req.query.projectId as string;
    if (req.query.workerId) filters.workerId = req.query.workerId as string;
    if (req.query.weekStart) filters.weekStart = req.query.weekStart as string;
    if (req.query.weekEnd) filters.weekEnd = req.query.weekEnd as string;

    const entries = await storage.getPayrollEntries(req.params.companyId, filters);
    const totalPay = entries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);

    res.json({ ok: true, entries, count: entries.length, totalPay });
  } catch (err: any) {
    console.error("GET /api/companies/:companyId/payroll error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get payroll entries by week
app.get("/api/companies/:companyId/payroll/week/:weekStart", async (req, res) => {
  try {
    const entries = await storage.getPayrollEntriesByWeek(req.params.companyId, req.params.weekStart);
    const totalPay = entries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);

    // Group by project for summary
    const byProject: Record<string, { projectId: string; totalPay: number; daysWorked: number; workerCount: number }> = {};
    for (const e of entries) {
      if (!byProject[e.projectId]) {
        byProject[e.projectId] = { projectId: e.projectId, totalPay: 0, daysWorked: 0, workerCount: 0 };
      }
      byProject[e.projectId].totalPay += parseFloat(e.totalPay);
      byProject[e.projectId].daysWorked += parseFloat(e.daysWorked);
      byProject[e.projectId].workerCount += 1;
    }

    res.json({
      ok: true,
      entries,
      count: entries.length,
      totalPay,
      byProject: Object.values(byProject),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get payroll entries for a project
app.get("/api/projects/:projectId/payroll", async (req, res) => {
  try {
    const entries = await storage.getPayrollEntriesByProject(req.params.projectId);
    const totalLaborCost = entries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);

    res.json({ ok: true, entries, count: entries.length, totalLaborCost });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get payroll entries for a worker
app.get("/api/workers/:workerId/payroll", async (req, res) => {
  try {
    const entries = await storage.getPayrollEntriesByWorker(req.params.workerId);
    const totalPay = entries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);

    res.json({ ok: true, entries, count: entries.length, totalPay });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a single payroll entry
app.post("/api/companies/:companyId/payroll", async (req, res) => {
  try {
    const entry = await storage.createPayrollEntry({
      ...req.body,
      companyId: req.params.companyId,
    });
    res.status(201).json({ ok: true, entry });
  } catch (err: any) {
    console.error("POST /api/companies/:companyId/payroll error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk create payroll entries (for Excel import)
app.post("/api/companies/:companyId/payroll/bulk", async (req, res) => {
  try {
    const { entries, replaceWeek } = req.body;

    // If replaceWeek is set, delete existing entries for that week first
    if (replaceWeek) {
      const deleted = await storage.deletePayrollEntriesByWeek(req.params.companyId, replaceWeek);
      console.log(`[payroll/bulk] Deleted ${deleted} entries for week ${replaceWeek}`);
    }

    // Add companyId to each entry
    const entriesWithCompany = entries.map((e: any) => ({
      ...e,
      companyId: req.params.companyId,
    }));

    const created = await storage.createPayrollEntries(entriesWithCompany);

    const totalPay = created.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);

    res.status(201).json({
      ok: true,
      count: created.length,
      totalPay,
      entries: created,
    });
  } catch (err: any) {
    console.error("POST /api/companies/:companyId/payroll/bulk error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update a payroll entry
app.patch("/api/payroll/:id", async (req, res) => {
  try {
    const entry = await storage.updatePayrollEntry(req.params.id, req.body);
    res.json({ ok: true, entry });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a payroll entry
app.delete("/api/payroll/:id", async (req, res) => {
  try {
    await storage.deletePayrollEntry(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get project labor cost summary
app.get("/api/projects/:projectId/labor-cost", async (req, res) => {
  try {
    const totalLaborCost = await storage.getProjectLaborCost(req.params.projectId);
    const entries = await storage.getPayrollEntriesByProject(req.params.projectId);

    // Group by week
    const byWeek: Record<string, number> = {};
    for (const e of entries) {
      byWeek[e.weekStart] = (byWeek[e.weekStart] || 0) + parseFloat(e.totalPay);
    }

    res.json({
      ok: true,
      totalLaborCost,
      entryCount: entries.length,
      byWeek: Object.entries(byWeek).map(([week, cost]) => ({ week, cost })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PAYROLL EXCEL IMPORT ==========

/**
 * Upload and parse payroll Excel file
 * Returns parsed data for review before importing
 */
app.post("/api/companies/:companyId/payroll/parse-excel", uploadExcel.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const companyId = req.params.companyId;
    console.log(`[payroll/parse-excel] Parsing file: ${req.file.originalname} for company ${companyId}`);

    // Parse the Excel file
    const parsed = parsePayrollExcel(req.file.buffer);

    if (parsed.errors.length > 0) {
      return res.status(400).json({
        ok: false,
        errors: parsed.errors,
        warnings: parsed.warnings,
      });
    }

    // Get existing workers and projects for matching
    const [existingWorkers, existingProjects] = await Promise.all([
      storage.getWorkers(companyId),
      storage.getProjects(companyId),
    ]);

    // Build lookup maps (case-insensitive)
    const workerMap = new Map<string, { id: string; name: string; dailyRate: string | null }>();
    for (const w of existingWorkers) {
      workerMap.set(w.name.toLowerCase().trim(), { id: w.id, name: w.name, dailyRate: w.dailyRate });
    }

    const projectMap = new Map<string, { id: string; name: string }>();
    for (const p of existingProjects) {
      projectMap.set(p.name.toLowerCase().trim(), { id: p.id, name: p.name });
      // Also try without common prefixes
      if (p.name.toUpperCase().startsWith('PROJECT ')) {
        projectMap.set(p.name.substring(8).toLowerCase().trim(), { id: p.id, name: p.name });
      }
    }

    // Match workers and projects
    const unmatchedWorkers: string[] = [];
    const unmatchedProjects: string[] = [];
    const matchedEntries: Array<{
      row: PayrollRow;
      workerId: string | null;
      workerName: string;
      projectId: string | null;
      projectName: string;
      isNewWorker: boolean;
      isNewProject: boolean;
    }> = [];

    for (const row of parsed.rows) {
      const workerKey = row.workerName.toLowerCase().trim();
      const projectKey = row.proyecto.toLowerCase().trim();

      const matchedWorker = workerMap.get(workerKey);
      const matchedProject = projectMap.get(projectKey);

      if (!matchedWorker && !unmatchedWorkers.includes(row.workerName)) {
        unmatchedWorkers.push(row.workerName);
      }

      if (!matchedProject && !unmatchedProjects.includes(row.proyecto)) {
        unmatchedProjects.push(row.proyecto);
      }

      matchedEntries.push({
        row,
        workerId: matchedWorker?.id || null,
        workerName: matchedWorker?.name || row.workerName,
        projectId: matchedProject?.id || null,
        projectName: matchedProject?.name || row.proyecto,
        isNewWorker: !matchedWorker,
        isNewProject: !matchedProject,
      });
    }

    // Calculate totals
    const totalPay = parsed.rows.reduce((sum, r) => sum + r.totalPay, 0);
    const totalDays = parsed.rows.reduce((sum, r) => sum + r.daysWorked, 0);

    res.json({
      ok: true,
      weekStart: parsed.weekStart,
      weekEnd: parsed.weekEnd,
      filename: req.file.originalname,
      rowCount: parsed.rows.length,
      totalPay,
      totalDays,
      warnings: parsed.warnings,
      unmatchedWorkers,
      unmatchedProjects,
      entries: matchedEntries,
      // Summary by project
      byProject: Object.entries(
        matchedEntries.reduce((acc, e) => {
          const key = e.projectName;
          if (!acc[key]) acc[key] = { name: key, totalPay: 0, workerCount: 0, daysWorked: 0, projectId: e.projectId };
          acc[key].totalPay += e.row.totalPay;
          acc[key].daysWorked += e.row.daysWorked;
          acc[key].workerCount += 1;
          return acc;
        }, {} as Record<string, { name: string; totalPay: number; workerCount: number; daysWorked: number; projectId: string | null }>)
      ).map(([_, v]) => v),
    });

  } catch (err: any) {
    console.error("[payroll/parse-excel] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Import parsed payroll data
 * Creates new workers if needed, then creates payroll entries
 */
app.post("/api/companies/:companyId/payroll/import", async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const {
      weekStart,
      weekEnd,
      entries,
      createMissingWorkers = true,
      createMissingProjects = true,
      replaceExistingWeek = true,
      sourceRef,
      projectMappings = {}, // Maps new project names to existing project IDs
    } = req.body;

    if (!weekStart || !weekEnd || !entries || !Array.isArray(entries)) {
      return res.status(400).json({ error: "Missing required fields: weekStart, weekEnd, entries" });
    }

    console.log(`[payroll/import] Importing ${entries.length} entries for week ${weekStart}`);

    // Get existing workers and projects
    const [existingWorkers, existingProjects] = await Promise.all([
      storage.getWorkers(companyId),
      storage.getProjects(companyId),
    ]);

    const workerMap = new Map<string, string>();
    for (const w of existingWorkers) {
      workerMap.set(w.name.toLowerCase().trim(), w.id);
    }

    const projectMap = new Map<string, string>();
    for (const p of existingProjects) {
      projectMap.set(p.name.toLowerCase().trim(), p.id);
    }

    const createdWorkers: string[] = [];
    const createdProjects: string[] = [];
    const skippedEntries: { worker: string; project: string; reason: string }[] = [];
    const payrollEntries: PayrollEntryInput[] = [];

    for (const entry of entries) {
      const { row, workerName, projectName } = entry;

      // Find or create worker
      let workerId = workerMap.get(workerName.toLowerCase().trim());

      if (!workerId && createMissingWorkers) {
        // Create the worker
        const newWorker = await storage.createWorker({
          companyId,
          name: workerName,
          dailyRate: row.dailyRate.toString(),
          role: row.cargo || null,
          workerType: "employee",
        });
        workerId = newWorker.id;
        workerMap.set(workerName.toLowerCase().trim(), workerId);
        createdWorkers.push(workerName);
      }

      if (!workerId) {
        skippedEntries.push({ worker: workerName, project: projectName, reason: "Worker not found and createMissingWorkers is false" });
        continue;
      }

      // Find or create project
      // First check if there's a mapping for this project name
      const projectMapping = projectMappings[projectName];

      // If explicitly skipped, don't import this entry
      if (projectMapping === "__skip__") {
        skippedEntries.push({ worker: workerName, project: projectName, reason: "Project skipped by user" });
        continue;
      }

      // Use mapping if it's a valid project ID, otherwise look up by name
      let projectId = (projectMapping && projectMapping !== "__create__")
        ? projectMapping
        : projectMap.get(projectName.toLowerCase().trim());

      if (!projectId && createMissingProjects) {
        // Create the project
        const newProject = await storage.createProject({
          companyId,
          name: projectName,
          status: "active",
        });
        projectId = newProject.id;
        projectMap.set(projectName.toLowerCase().trim(), projectId);
        createdProjects.push(projectName);
      }

      if (!projectId) {
        skippedEntries.push({ worker: workerName, project: projectName, reason: "Project not found and createMissingProjects is false" });
        continue;
      }

      payrollEntries.push({
        workerId,
        projectId,
        weekStart,
        weekEnd,
        daysWorked: row.daysWorked.toString(),
        dailyRate: row.dailyRate.toString(),
        basePay: row.basePay.toString(),
        parking: row.parking.toString(),
        overtimeHours: row.overtimeHours.toString(),
        overtimePay: row.overtimePay.toString(),
        bonus: row.bonus.toString(),
        deductions: row.deductions.toString(),
        totalPay: row.totalPay.toString(),
        source: "excel_import",
        sourceRef: sourceRef || undefined,
      });
    }

    // Delete existing entries for this week if requested
    if (replaceExistingWeek) {
      const deleted = await storage.deletePayrollEntriesByWeek(companyId, weekStart);
      console.log(`[payroll/import] Deleted ${deleted} existing entries for week ${weekStart}`);
    }

    // Create payroll entries
    let created: any[] = [];
    if (payrollEntries.length > 0) {
      created = await storage.createPayrollEntries(
        payrollEntries.map(e => ({
          ...e,
          companyId,
        }))
      );
    }

    const totalPay = created.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);

    res.json({
      ok: true,
      weekStart,
      weekEnd,
      entriesCreated: created.length,
      totalPay,
      createdWorkers,
      createdProjects,
      skippedEntries,
      warnings: skippedEntries.length > 0 ? [`${skippedEntries.length} entries were skipped`] : [],
    });

  } catch (err: any) {
    console.error("[payroll/import] Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ========== UNIVERSAL FILE UPLOAD ==========

// Multer for universal uploads (PDF, images, Excel, CSV)
const uploadUniversal = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/heic",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    const ext = file.originalname.toLowerCase().split(".").pop() || "";
    const validExtensions = ["pdf", "png", "jpg", "jpeg", "heic", "webp", "xlsx", "xls", "csv"];

    if (allowedTypes.includes(file.mimetype) || validExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: PDF, images, Excel, CSV`));
    }
  },
});

// Parse spreadsheet (Excel/CSV) - returns structured data
app.post("/api/upload/parse-spreadsheet", uploadUniversal.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const ext = req.file.originalname.toLowerCase().split(".").pop() || "";
    const isCSV = ext === "csv" || req.file.mimetype === "text/csv";

    let headers: string[] = [];
    let rows: Record<string, string | number | null>[] = [];
    let sheetName: string | undefined;

    if (isCSV) {
      // Parse CSV
      const content = req.file.buffer.toString("utf-8");
      const lines = content.split(/\r?\n/).filter(line => line.trim());

      if (lines.length === 0) {
        return res.status(400).json({ error: "Empty CSV file" });
      }

      // Parse header
      headers = lines[0].split(",").map(h => h.trim().replace(/^"(.*)"$/, "$1"));

      // Parse rows
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"(.*)"$/, "$1"));
        const row: Record<string, string | number | null> = {};
        headers.forEach((h, idx) => {
          const val = values[idx] || "";
          // Try to parse as number
          const num = parseFloat(val.replace(/[$,]/g, ""));
          row[h] = !isNaN(num) && val !== "" ? num : val || null;
        });
        rows.push(row);
      }
    } else {
      // Parse Excel using xlsx
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

      // Get first sheet
      sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: null });

      if (jsonData.length === 0) {
        return res.status(400).json({ error: "Empty spreadsheet" });
      }

      // Extract headers from first row keys
      headers = Object.keys(jsonData[0]);
      rows = jsonData;
    }

    res.json({
      ok: true,
      data: {
        headers,
        rows,
        sheetName,
      },
      rowCount: rows.length,
      filename: req.file.originalname,
    });
  } catch (err: any) {
    console.error("[parse-spreadsheet] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Extract data from PDF/images using AI
app.post("/api/upload/extract-ai", uploadUniversal.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId, companyId, mode } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "companyId is required" });
    }

    const ext = req.file.originalname.toLowerCase().split(".").pop() || "";
    const isPdf = ext === "pdf" || req.file.mimetype === "application/pdf";
    const isImage = ["jpg", "jpeg", "png", "heic", "webp"].includes(ext) ||
      req.file.mimetype.startsWith("image/");

    if (!isPdf && !isImage) {
      return res.status(400).json({
        error: "AI extraction only supports PDF and image files. Use /api/upload/parse-spreadsheet for Excel/CSV.",
      });
    }

    let extractedText = "";
    let extractedData: any = null;
    const bucket = process.env.AWS_S3_BUCKET || "";

    // Path 1: S3 + Textract (if configured)
    if (bucket) {
      try {
        const s3Key = `uploads/${companyId}/${Date.now()}-${req.file.originalname}`;
        await putS3ObjectBuffer({
          bucket,
          key: s3Key,
          body: req.file.buffer,
          contentType: req.file.mimetype,
        });

        const job = await storage.createIngestionJob({
          companyId,
          sourceType: isPdf ? "pdf_upload" : "image_upload",
          filename: req.file.originalname,
          fileUrl: `s3://${bucket}/${s3Key}`,
          status: "pending",
        });

        try {
          const ocrResult = await textractSmartOCR(bucket, s3Key, req.file.mimetype);
          extractedText = ocrResult.text;

          const parsed = parseOcrToStructured(extractedText);

          extractedData = {
            type: mode === "receipt" ? "receipt" : mode === "contract" ? "contract" : "invoice",
            fields: [] as Array<{ field: string; value: string | number | null; confidence?: number }>,
            lineItems: parsed.lineItems || [],
            rawText: extractedText.substring(0, 1000),
          };

          if (parsed.totals) {
            const possibleTotals = parsed.totals.possibleTotals || [];
            if (possibleTotals.length > 0) {
              extractedData.fields.push({ field: "total", value: possibleTotals[0], confidence: 0.7 });
            }
            const totals = parsed.totals as any;
            if (totals.taxTotal) {
              extractedData.fields.push({ field: "tax", value: totals.taxTotal, confidence: 0.8 });
            }
          }

          if (parsed.vendorOrClient) {
            extractedData.fields.push({ field: "vendor", value: parsed.vendorOrClient, confidence: 0.6 });
          }

          if (parsed.projectName) {
            extractedData.fields.push({ field: "project", value: parsed.projectName, confidence: 0.5 });
          }

          await storage.updateIngestionJobExtractedText(job.id, extractedText);
          await storage.updateIngestionJobStatus(job.id, "completed");

        } catch (ocrErr: any) {
          console.error("[extract-ai] Textract error:", ocrErr.message);
          await storage.updateIngestionJobStatus(job.id, "error", ocrErr.message);
          // Fall through to local extraction
        }
      } catch (s3Err: any) {
        console.error("[extract-ai] S3 upload error:", s3Err.message);
        // Fall through to local extraction
      }
    }

    // Path 2: Local extraction with Claude (fallback or no S3)
    if (!extractedData) {
      console.log("[extract-ai] Using local extraction (no S3 or Textract failed)");

      try {
        if (isPdf) {
          // Extract text from PDF locally using pdf-parse
          const { extractPdfText } = await import("./pdfExtract");
          const pdfResult = await extractPdfText(req.file.buffer, false);
          extractedText = pdfResult.text;

          console.log(`[extract-ai] PDF text extracted: ${extractedText.length} chars, hasUsable: ${pdfResult.hasUsableText}`);

          if (pdfResult.hasUsableText && extractedText.length > 50) {
            // Check for signs of multiple invoices
            const invoiceCountIndicators = [
              (extractedText.match(/invoice\s*(number|#|no\.?)\s*[:.]?\s*\d/gi) || []).length,
              (extractedText.match(/total\s*(due|amount)?[\s:]+\$?\d/gi) || []).length,
              (extractedText.match(/grand\s*total[\s:]+\$?\d/gi) || []).length,
            ];
            const maxInvoiceIndicators = Math.max(...invoiceCountIndicators);
            const multipleInvoicesLikely = maxInvoiceIndicators > 1;

            if (multipleInvoicesLikely) {
              console.log(`[extract-ai] Multiple invoices detected (~${maxInvoiceIndicators} invoices in document)`);
            }

            // Use Claude to structure the extracted text
            const llmClient = getLlmClient();
            if (llmClient) {
              console.log("[extract-ai] Calling Claude for invoice extraction...");
              const llmResult = await llmClient.extractInvoice({
                ocrText: extractedText,
                mode: "full",
              });

              if (llmResult.success && llmResult.data) {
                const inv = llmResult.data;
                const hasMultiple = inv.multipleInvoicesDetected === true;

                console.log(`[extract-ai] Claude extraction successful${hasMultiple ? " (MULTIPLE INVOICES DETECTED)" : ""}`);

                // Build fields array from extracted invoice
                const fields: Array<{ field: string; value: string | number | null; confidence?: number }> = [];
                if (inv.vendor) fields.push({ field: "vendor", value: inv.vendor, confidence: 0.9 });
                if (inv.invoiceNumber) fields.push({ field: "invoiceNumber", value: inv.invoiceNumber, confidence: 0.9 });
                if (inv.invoiceDate) fields.push({ field: "date", value: inv.invoiceDate, confidence: 0.9 });
                if (inv.total) fields.push({ field: "total", value: inv.total, confidence: 0.9 });
                if (inv.subtotal) fields.push({ field: "subtotal", value: inv.subtotal, confidence: 0.8 });
                if (inv.tax) fields.push({ field: "tax", value: inv.tax, confidence: 0.8 });
                if (inv.customerPo) fields.push({ field: "project", value: inv.customerPo, confidence: 0.9 });

                extractedData = {
                  type: mode === "receipt" ? "receipt" : mode === "contract" ? "contract" : "invoice",
                  fields,
                  lineItems: inv.lineItems || [],
                  rawText: extractedText.substring(0, 1000),
                  multipleInvoicesDetected: hasMultiple,
                };

                if (hasMultiple) {
                  console.log("[extract-ai] WARNING: Document contains multiple invoices - user should upload one at a time");
                }
              } else {
                console.warn("[extract-ai] Claude extraction failed:", llmResult.error);
              }
            } else {
              console.warn("[extract-ai] No LLM client configured");
            }
          }
        } else if (isImage) {
          // For images, we need vision API - use Claude with base64 image
          const llmConfig = getLlmConfig();
          if (llmConfig.configured && llmConfig.provider === "anthropic") {
            const Anthropic = (await import("@anthropic-ai/sdk")).default;
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

            const base64Image = req.file.buffer.toString("base64");
            const mediaType = req.file.mimetype as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

            console.log("[extract-ai] Calling Claude Vision for image extraction...");

            const response = await client.messages.create({
              model: llmConfig.model,
              max_tokens: 2000,
              messages: [{
                role: "user",
                content: [
                  {
                    type: "image",
                    source: { type: "base64", media_type: mediaType, data: base64Image },
                  },
                  {
                    type: "text",
                    text: `Extract invoice/receipt data from this image. Return ONLY valid JSON with this structure:
{
  "vendor": string|null,
  "invoiceNumber": string|null,
  "invoiceDate": string|null (YYYY-MM-DD),
  "total": number|null,
  "subtotal": number|null,
  "tax": number|null,
  "customerPo": string|null,
  "lineItems": [{"description": string, "quantity": number|null, "unitPrice": number|null, "lineAmount": number|null}]
}
Return ONLY JSON, no markdown or explanation.`,
                  },
                ],
              }],
            });

            const textContent = response.content.find((c: any) => c.type === "text");
            if (textContent && textContent.type === "text") {
              try {
                const { extractJsonObject, coerceNumericFields } = await import("./llmClient");
                let parsed = extractJsonObject(textContent.text);
                parsed = coerceNumericFields(parsed);

                extractedData = {
                  type: mode === "receipt" ? "receipt" : "invoice",
                  fields: [] as Array<{ field: string; value: string | number | null; confidence?: number }>,
                  lineItems: parsed.lineItems || [],
                  rawText: textContent.text.substring(0, 500),
                };

                if (parsed.vendor) extractedData.fields.push({ field: "vendor", value: parsed.vendor, confidence: 0.9 });
                if (parsed.invoiceNumber) extractedData.fields.push({ field: "invoiceNumber", value: parsed.invoiceNumber, confidence: 0.9 });
                if (parsed.invoiceDate) extractedData.fields.push({ field: "date", value: parsed.invoiceDate, confidence: 0.9 });
                if (parsed.total) extractedData.fields.push({ field: "total", value: parsed.total, confidence: 0.9 });
                if (parsed.subtotal) extractedData.fields.push({ field: "subtotal", value: parsed.subtotal, confidence: 0.8 });
                if (parsed.tax) extractedData.fields.push({ field: "tax", value: parsed.tax, confidence: 0.8 });
                if (parsed.customerPo) extractedData.fields.push({ field: "project", value: parsed.customerPo, confidence: 0.7 });

                console.log(`[extract-ai] Vision extraction successful: vendor=${parsed.vendor}, total=${parsed.total}`);
              } catch (parseErr: any) {
                console.error("[extract-ai] Failed to parse vision response:", parseErr.message);
              }
            }
          }
        }
      } catch (localErr: any) {
        console.error("[extract-ai] Local extraction error:", localErr.message);
      }
    }

    // Path 3: Manual entry fallback
    if (!extractedData) {
      extractedData = {
        type: mode === "receipt" ? "receipt" : "invoice",
        fields: [
          { field: "status", value: "Manual entry required - AI extraction unavailable", confidence: 1.0 },
        ],
        lineItems: [],
        rawText: extractedText || "Could not extract text from document.",
      };
    }

    // Smart project detection: try to match extracted project reference to existing projects
    let matchedProject: { id: string; name: string; confidence: number } | null = null;
    const projectField = extractedData.fields.find((f: any) => f.field === "project");

    if (projectField?.value && typeof projectField.value === "string") {
      try {
        const projects = await storage.getProjects(companyId);
        const searchText = projectField.value.toLowerCase().trim();

        // Score all projects and pick the best match
        let bestMatch: { project: typeof projects[0]; score: number } | null = null;

        for (const project of projects) {
          const projectName = (project.name || "").toLowerCase().trim();
          const projectAddress = (project.address || "").toLowerCase();

          let score = 0;

          // Exact name match - highest priority (score 100)
          if (projectName === searchText) {
            score = 100;
          }
          // Name contains search text (score 80)
          else if (projectName.includes(searchText)) {
            score = 80;
          }
          // Search text contains project name (score 70)
          else if (searchText.includes(projectName) && projectName.length > 2) {
            score = 70;
          }
          // Address match - lower priority (score 50)
          else if (projectAddress && (projectAddress.includes(searchText) || searchText.includes(projectAddress))) {
            score = 50;
          }

          if (score > 0 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { project, score };
          }
        }

        if (bestMatch) {
          matchedProject = {
            id: bestMatch.project.id,
            name: bestMatch.project.name,
            confidence: bestMatch.score >= 100 ? 0.95 : bestMatch.score >= 70 ? 0.8 : 0.6,
          };
        }

        // If we found a match and it's different from the current projectId, add it to the response
        if (matchedProject && projectId && matchedProject.id !== projectId) {
          console.log(`[extract-ai] Detected project mismatch: invoice is for "${matchedProject.name}" but uploaded in project ${projectId}`);
        }
      } catch (matchErr: any) {
        console.warn("[extract-ai] Project matching failed:", matchErr.message);
      }
    }

    res.json({
      ok: true,
      data: extractedData,
      filename: req.file.originalname,
      fileType: isPdf ? "pdf" : "image",
      matchedProject: matchedProject,
      currentProjectId: projectId || null,
    });

  } catch (err: any) {
    console.error("[extract-ai] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Save vendor invoice from extracted data
app.post("/api/projects/:projectId/vendor-invoices", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { companyId, vendor, invoiceNumber, invoiceDate, total, subtotal, tax, lineItems } = req.body;

    if (!companyId || !vendor) {
      return res.status(400).json({ error: "companyId and vendor are required" });
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Normalize invoice number for duplicate check
    const invoiceNumberNormalized = invoiceNumber
      ? invoiceNumber.toString().toUpperCase().replace(/[^A-Z0-9]/g, "")
      : null;

    // Check for duplicate invoice (same invoice number + vendor in same project)
    if (invoiceNumberNormalized) {
      const existingInvoices = await storage.getInvoicesByCompany(companyId, { projectId });
      const normalizedVendorCheck = normalizeVendorName(vendor);
      const duplicate = existingInvoices.find(inv => {
        const invNumNorm = inv.invoiceNumber?.toString().toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
        const invVendorNorm = normalizeVendorName(inv.vendor || "");
        return invNumNorm === invoiceNumberNormalized && invVendorNorm === normalizedVendorCheck;
      });

      if (duplicate) {
        console.log(`[vendor-invoices] Duplicate detected: ${invoiceNumber} from ${vendor} already exists as ${duplicate.id}`);
        return res.status(409).json({
          error: "Duplicate invoice",
          message: `Invoice ${invoiceNumber} from ${vendor} already exists in this project`,
          existingInvoiceId: duplicate.id,
        });
      }
    }

    // Find or create vendor
    const normalizedVendor = normalizeVendorName(vendor);
    const vendors = await storage.getVendors(companyId);
    let vendorRecord = vendors.find(v =>
      normalizeVendorName(v.name) === normalizedVendor ||
      (v.normalizedName && v.normalizedName === normalizedVendor)
    );

    let vendorId: string;
    if (vendorRecord) {
      vendorId = vendorRecord.id;
    } else {
      const newVendor = await storage.createVendor({
        companyId,
        name: vendor,
        normalizedName: normalizedVendor,
      });
      vendorId = newVendor.id;
    }

    // Normalize invoice number for dedupe
    const invoiceNumberNorm = invoiceNumber
      ? invoiceNumber.toString().toUpperCase().replace(/[^A-Z0-9]/g, "")
      : `MANUAL-${Date.now()}`;

    // Create invoice
    const invoice = await storage.createInvoice({
      companyId,
      projectId,
      vendorId,
      vendor,
      invoiceNumber: invoiceNumber || `MANUAL-${Date.now()}`,
      invoiceNumberNorm,
      invoiceDate: invoiceDate || new Date().toISOString().split("T")[0],
      subtotal: subtotal?.toString() || null,
      tax: tax?.toString() || null,
      total: total?.toString() || "0",
      totalConfidence: "0.90",
      vendorConfidence: "0.90",
      extractionMethod: "ai_upload",
      status: "parsed_ok",
    } as any);

    console.log(`[vendor-invoices] Created invoice ${invoice.id} for project ${projectId}`);

    // Create line items if provided
    if (lineItems && lineItems.length > 0) {
      const lineItemsToInsert = lineItems.map((li: any) => ({
        invoiceId: invoice.id,
        companyId,
        productCode: li.productCode || null,
        description: li.description || "Unknown item",
        quantity: li.quantity?.toString() || null,
        unit: li.unit || null,
        unitPrice: li.unitPrice?.toString() || null,
        lineAmount: (li.lineAmount || li.totalCost)?.toString() || null,
        category: li.category || "misc",
        categoryConfidence: "0.80",
      }));
      await storage.createInvoiceLineItems(lineItemsToInsert);
      console.log(`[vendor-invoices] Created ${lineItemsToInsert.length} line items for invoice ${invoice.id}`);
    }

    res.json({
      ok: true,
      invoice: {
        id: invoice.id,
        vendor,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        lineItemCount: lineItems?.length || 0,
      },
    });

  } catch (err: any) {
    console.error("[vendor-invoices] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get materials summary for a project (vendor invoices)
app.get("/api/projects/:projectId/materials/summary", async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get all invoices for this project
    const allInvoices = await storage.getInvoicesByCompany(project.companyId, { projectId });
    const projectInvoices = allInvoices;

    // Calculate totals and get line items for each invoice
    let totalMaterials = 0;
    const invoices = await Promise.all(projectInvoices.map(async inv => {
      const invoiceTotal = parseFloat(inv.total || "0");
      totalMaterials += invoiceTotal;

      // Get line items to find primary category
      const lineItems = await storage.getInvoiceLineItems(inv.id);

      // Count categories to find primary one
      const categoryCounts: Record<string, number> = {};
      lineItems.forEach(li => {
        const cat = li.category || "misc";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });

      // Find primary category (most common)
      let primaryCategory = "misc";
      let maxCount = 0;
      for (const [cat, count] of Object.entries(categoryCounts)) {
        if (count > maxCount) {
          maxCount = count;
          primaryCategory = cat;
        }
      }

      // Get all unique categories for this invoice
      const categories = Object.keys(categoryCounts);

      return {
        id: inv.id,
        vendor: inv.vendor,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        total: inv.total,
        subtotal: inv.subtotal,
        tax: inv.tax,
        status: inv.status,
        primaryCategory,
        categories,
        lineItemCount: lineItems.length,
      };
    }));

    res.json({
      invoices,
      totalMaterials,
      invoiceCount: projectInvoices.length,
    });

  } catch (err: any) {
    console.error("[materials/summary] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete duplicate invoices in a project
app.delete("/api/projects/:projectId/invoices/duplicates", async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const allInvoices = await storage.getInvoicesByCompany(project.companyId, { projectId });

    // Group by normalized invoice number + vendor
    const groups: Record<string, typeof allInvoices> = {};
    for (const inv of allInvoices) {
      const invNumNorm = inv.invoiceNumber?.toString().toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
      const invVendorNorm = normalizeVendorName(inv.vendor || "");
      const key = `${invNumNorm}::${invVendorNorm}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(inv);
    }

    // Find duplicates and delete all but the oldest
    let deletedCount = 0;
    const deletedIds: string[] = [];
    for (const [key, invoices] of Object.entries(groups)) {
      if (invoices.length > 1) {
        // Sort by createdAt, keep the oldest
        invoices.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const toDelete = invoices.slice(1); // Delete all but the first (oldest)
        for (const inv of toDelete) {
          await storage.deleteInvoice(inv.id);
          deletedIds.push(inv.id);
          deletedCount++;
          console.log(`[cleanup] Deleted duplicate invoice ${inv.id} (${inv.invoiceNumber} from ${inv.vendor})`);
        }
      }
    }

    res.json({
      ok: true,
      message: `Cleaned up ${deletedCount} duplicate invoices`,
      deletedCount,
      deletedIds,
    });

  } catch (err: any) {
    console.error("[cleanup duplicates] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get materials breakdown by category for a project
app.get("/api/projects/:projectId/materials/breakdown", async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const allInvoices = await storage.getInvoicesByCompany(project.companyId, { projectId });

    // Get all line items and group by category
    const categoryTotals: Record<string, { amount: number; itemCount: number; invoiceCount: number; items: any[] }> = {};

    for (const inv of allInvoices) {
      const lineItems = await storage.getInvoiceLineItems(inv.id);

      for (const li of lineItems) {
        const cat = li.category || "misc";
        if (!categoryTotals[cat]) {
          categoryTotals[cat] = { amount: 0, itemCount: 0, invoiceCount: 0, items: [] };
        }

        const lineAmount = parseFloat(li.lineAmount || "0");
        categoryTotals[cat].amount += lineAmount;
        categoryTotals[cat].itemCount++;
        categoryTotals[cat].items.push({
          id: li.id,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          vendor: inv.vendor,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unitPrice: li.unitPrice,
          lineAmount: li.lineAmount,
          invoiceDate: inv.invoiceDate,
        });
      }
    }

    // Track invoice count per category
    for (const inv of allInvoices) {
      const lineItems = await storage.getInvoiceLineItems(inv.id);
      const invoiceCategories = Array.from(new Set(lineItems.map(li => li.category || "misc")));
      for (const cat of invoiceCategories) {
        if (categoryTotals[cat]) {
          categoryTotals[cat].invoiceCount++;
        }
      }
    }

    // Convert to array and sort by amount
    const breakdown = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        itemCount: data.itemCount,
        invoiceCount: data.invoiceCount,
        items: data.items.slice(0, 10), // Limit to first 10 items
      }))
      .sort((a, b) => b.amount - a.amount);

    const totalMaterials = breakdown.reduce((sum, cat) => sum + cat.amount, 0);

    res.json({
      ok: true,
      breakdown,
      totalMaterials,
      categoryCount: breakdown.length,
    });

  } catch (err: any) {
    console.error("[materials/breakdown] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get labor breakdown by role for a project
app.get("/api/projects/:projectId/labor/breakdown", async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get payroll entries for this project
    const entries = await storage.getPayrollEntriesByProject(projectId);

    // Group by worker role
    const roleTotals: Record<string, { amount: number; hours: number; workerCount: number; workers: any[] }> = {};

    // Get worker details
    const workers = await storage.getWorkers(project.companyId);
    const workerMap = new Map(workers.map(w => [w.id, w]));

    for (const entry of entries) {
      const worker = workerMap.get(entry.workerId);
      const role = worker?.role || "unassigned";

      if (!roleTotals[role]) {
        roleTotals[role] = { amount: 0, hours: 0, workerCount: 0, workers: [] };
      }

      const totalPay = parseFloat(entry.totalPay || "0");
      const daysWorked = parseFloat(entry.daysWorked || "0");
      const estimatedHours = daysWorked * 8; // Estimate 8 hours per day

      roleTotals[role].amount += totalPay;
      roleTotals[role].hours += estimatedHours;

      // Add worker if not already in list
      if (!roleTotals[role].workers.find(w => w.id === entry.workerId)) {
        roleTotals[role].workers.push({
          id: entry.workerId,
          name: worker?.name || "Unknown",
          role: role,
        });
        roleTotals[role].workerCount++;
      }
    }

    // Convert to array and sort by amount
    const breakdown = Object.entries(roleTotals)
      .map(([role, data]) => ({
        role,
        amount: data.amount,
        hours: data.hours,
        workerCount: data.workerCount,
        workers: data.workers,
      }))
      .sort((a, b) => b.amount - a.amount);

    const totalLabor = breakdown.reduce((sum, role) => sum + role.amount, 0);
    const totalHours = breakdown.reduce((sum, role) => sum + role.hours, 0);

    res.json({
      ok: true,
      breakdown,
      totalLabor,
      totalHours,
      roleCount: breakdown.length,
    });

  } catch (err: any) {
    console.error("[labor/breakdown] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Parse takeoff spreadsheet (Excel/CSV)
app.post("/api/parse-takeoff", uploadExcel.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length < 2) {
      return res.status(400).json({ error: "File appears to be empty or has no data rows" });
    }

    // Try to detect header row and column mappings
    const headers = rawData[0] as string[];
    const headerLower = headers.map((h: any) => (h || "").toString().toLowerCase());

    // Find column indices
    const nameCol = headerLower.findIndex((h: string) => h.includes("name") || h.includes("description") || h.includes("item"));
    const qtyCol = headerLower.findIndex((h: string) => h === "qty" || h.includes("quantity") || h.includes("# of units"));
    const unitCol = headerLower.findIndex((h: string) => h === "units" || h.includes("unit") || h === "uom");
    const unitCostCol = headerLower.findIndex((h: string) => h.includes("cost each") || h.includes("unit cost") || h.includes("price each") || h === "rate");
    const totalCostCol = headerLower.findIndex((h: string) => h.includes("price total") || h.includes("total cost") || h.includes("total") || h.includes("amount"));
    const typeCol = headerLower.findIndex((h: string) => h === "type" || h.includes("takeoff type"));

    console.log("[parse-takeoff] Column mappings:", { nameCol, qtyCol, unitCol, unitCostCol, totalCostCol, typeCol });

    if (nameCol === -1) {
      return res.status(400).json({ error: "Could not find a 'Name' or 'Description' column in the file" });
    }

    // Parse data rows
    const items: any[] = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as any[];
      if (!row || row.length === 0) continue;

      const name = row[nameCol];
      if (!name || typeof name !== "string" || name.trim() === "") continue;

      // Skip folder/section headers (typically have no quantity or cost)
      const type = typeCol !== -1 ? (row[typeCol] || "").toString().toLowerCase() : "";
      if (type === "folder" || type === "area label") continue;

      const quantity = qtyCol !== -1 ? parseFloat(row[qtyCol]) || 0 : 0;
      const unit = unitCol !== -1 ? (row[unitCol] || "").toString() : "ea";
      const unitCost = unitCostCol !== -1 ? parseFloat(row[unitCostCol]) || 0 : 0;
      let totalCost = totalCostCol !== -1 ? parseFloat(row[totalCostCol]) || 0 : 0;

      // Calculate total if not present but we have qty and unit cost
      if (totalCost === 0 && quantity > 0 && unitCost > 0) {
        totalCost = quantity * unitCost;
      }

      // Skip rows with no meaningful data
      if (quantity === 0 && totalCost === 0) continue;

      items.push({
        name: name.toString().trim(),
        quantity,
        unit,
        unitCost,
        totalCost,
        type,
      });
    }

    console.log(`[parse-takeoff] Parsed ${items.length} items from ${rawData.length - 1} data rows`);

    res.json({
      ok: true,
      filename: req.file.originalname,
      sheetName,
      totalRows: rawData.length - 1,
      items,
    });

  } catch (err: any) {
    console.error("[parse-takeoff] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Parse check image and extract details using LLM
app.post("/api/parse-check", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const llmConfig = getLlmConfig();
    if (!llmConfig.configured || llmConfig.provider !== "anthropic") {
      // Return minimal data if no LLM configured
      return res.json({
        ok: true,
        extracted: {
          checkNumber: null,
          amount: null,
          date: null,
          payee: null,
          payer: null,
          memo: null,
        },
        warning: "LLM not configured - please enter check details manually",
      });
    }

    // Convert image to base64 for LLM
    const base64Image = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // Import Anthropic SDK dynamically
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Create prompt for check extraction
    const extractionPrompt = `You are analyzing an image of a check. Extract the following information and return it as JSON:

{
  "checkNumber": "the check number",
  "amount": "the dollar amount as a number (e.g., 15000.00)",
  "date": "the date on the check in YYYY-MM-DD format",
  "payee": "who the check is made out to (Pay to the order of)",
  "payer": "who wrote the check / the account holder name",
  "memo": "any memo or notes on the check"
}

If you cannot read or find a field, use null for that field. Only return the JSON object, no other text.`;

    // Call LLM with image
    const message = await client.messages.create({
      model: llmConfig.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: extractionPrompt,
            },
          ],
        },
      ],
    });

    // Parse LLM response
    let extracted: {
      checkNumber: string | null;
      amount: string | null;
      date: string | null;
      payee: string | null;
      payer: string | null;
      memo: string | null;
    } = {
      checkNumber: null,
      amount: null,
      date: null,
      payee: null,
      payer: null,
      memo: null,
    };

    try {
      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("[parse-check] Failed to parse LLM response:", parseErr);
    }

    console.log("[parse-check] Extracted:", extracted);

    res.json({
      ok: true,
      extracted,
    });

  } catch (err: any) {
    console.error("[parse-check] Error:", err);
    res.status(500).json({ error: err.message });
  }
});


  return httpServer;
}
