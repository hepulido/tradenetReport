/**
 * Invoice Extraction V2 - Multi-Invoice Support
 *
 * Handles:
 * - Multi-page PDFs with multiple invoices
 * - Extracts ALL line items
 * - Applies categorization
 * - Detects project from Ship To / Job Name
 */

import Anthropic from "@anthropic-ai/sdk";
import { categorizeLineItem } from "./categorize";

// Initialize Anthropic client
const anthropic = new Anthropic();

export type ExtractedLineItem = {
  productCode: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineAmount: number | null;
  category: string;
  categoryConfidence: number;
};

export type ExtractedInvoiceV2 = {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string | null;
  customerPo: string | null;
  jobName: string | null; // From "Ship To" or "Job" field
  shipToAddress: string | null;
  subtotal: number;
  tax: number;
  shipping: number | null;
  total: number;
  lineItems: ExtractedLineItem[];
};

export type MultiInvoiceExtractionResult = {
  success: boolean;
  invoices: ExtractedInvoiceV2[];
  error?: string;
  rawResponse?: string;
};

/**
 * Extract ALL invoices from OCR text using Claude
 * Handles multi-page documents with multiple invoices
 */
export async function extractAllInvoices(ocrText: string): Promise<MultiInvoiceExtractionResult> {
  const prompt = `You are an expert at extracting structured data from construction material invoices.

This document may contain MULTIPLE invoices (each page could be a separate invoice). Extract ALL of them.

IMPORTANT RULES:
1. Each invoice has its own invoice number, date, and totals
2. Extract EVERY line item from EVERY invoice - do not skip any
3. For each line item, include the product code, description, quantity, unit, unit price, and line amount
4. The "jobName" should come from "Ship To", "Job Name", "Job Number", or "Project" field
5. Return ALL invoices found in the document

OCR TEXT:
---
${ocrText}
---

Return ONLY valid JSON array with this structure (no markdown, no explanation):
[
  {
    "vendor": "Company name at top of invoice",
    "invoiceNumber": "INV-123",
    "invoiceDate": "2025-12-18",
    "dueDate": "2026-01-10",
    "customerPo": "PO number or null",
    "jobName": "Project/Job name from Ship To section",
    "shipToAddress": "Full ship-to address",
    "subtotal": 100.00,
    "tax": 7.00,
    "shipping": 0,
    "total": 107.00,
    "lineItems": [
      {
        "productCode": "ABC123",
        "description": "Full item description",
        "quantity": 5,
        "unit": "EA",
        "unitPrice": 20.00,
        "lineAmount": 100.00
      }
    ]
  }
]

CRITICAL: Extract EVERY single line item. If an invoice has 10 items, return all 10. Do not summarize or skip items.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return { success: false, invoices: [], error: "Unexpected response type" };
    }

    const rawResponse = content.text.trim();

    // Parse JSON
    let parsed: any[];
    try {
      // Remove markdown if present
      let cleaned = rawResponse;
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        parsed = [parsed]; // Single invoice returned as object
      }
    } catch (e) {
      console.error("[extractAllInvoices] Failed to parse JSON:", e);
      return { success: false, invoices: [], error: "Failed to parse LLM response", rawResponse };
    }

    // Process each invoice and apply categorization
    const invoices: ExtractedInvoiceV2[] = [];

    for (const inv of parsed) {
      const lineItems: ExtractedLineItem[] = [];

      if (Array.isArray(inv.lineItems)) {
        for (const li of inv.lineItems) {
          const desc = li.description || "";
          const catResult = categorizeLineItem(desc);

          lineItems.push({
            productCode: li.productCode || null,
            description: desc,
            quantity: typeof li.quantity === "number" ? li.quantity : null,
            unit: li.unit || null,
            unitPrice: typeof li.unitPrice === "number" ? li.unitPrice : null,
            lineAmount: typeof li.lineAmount === "number" ? li.lineAmount : null,
            category: catResult.category,
            categoryConfidence: catResult.confidence,
          });
        }
      }

      invoices.push({
        vendor: inv.vendor || "Unknown Vendor",
        invoiceNumber: inv.invoiceNumber || "Unknown",
        invoiceDate: inv.invoiceDate || new Date().toISOString().split("T")[0],
        dueDate: inv.dueDate || null,
        customerPo: inv.customerPo || null,
        jobName: inv.jobName || null,
        shipToAddress: inv.shipToAddress || null,
        subtotal: typeof inv.subtotal === "number" ? inv.subtotal : 0,
        tax: typeof inv.tax === "number" ? inv.tax : 0,
        shipping: typeof inv.shipping === "number" ? inv.shipping : null,
        total: typeof inv.total === "number" ? inv.total : 0,
        lineItems,
      });
    }

    console.log(`[extractAllInvoices] Extracted ${invoices.length} invoices with ${invoices.reduce((sum, i) => sum + i.lineItems.length, 0)} total line items`);

    return { success: true, invoices, rawResponse };

  } catch (error: any) {
    console.error("[extractAllInvoices] Error:", error);
    return { success: false, invoices: [], error: error.message };
  }
}

/**
 * Match job name to a project
 * Looks for matches in project name or address
 */
export function matchJobToProject(
  jobName: string | null,
  shipToAddress: string | null,
  projects: Array<{ id: string; name: string; externalRef?: string | null }>
): string | null {
  if (!jobName && !shipToAddress) return null;

  const searchTerms = [
    jobName?.toLowerCase(),
    shipToAddress?.toLowerCase(),
  ].filter(Boolean) as string[];

  for (const project of projects) {
    const projectName = project.name.toLowerCase();
    const projectRef = project.externalRef?.toLowerCase() || "";

    for (const term of searchTerms) {
      // Check if project name is in the search term or vice versa
      if (term.includes(projectName) || projectName.includes(term)) {
        return project.id;
      }
      if (projectRef && (term.includes(projectRef) || projectRef.includes(term))) {
        return project.id;
      }
    }
  }

  return null;
}
