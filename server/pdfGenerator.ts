import PDFDocument from "pdfkit";
import { storage } from "./storage";

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  amount: string;
  percentBilled?: string;
  cumulativePercent?: string;
  retainagePercent?: string;
  retainageAmount?: string;
  billingType: string;
  notes?: string;
  status: string;
  poNumber?: string;
}

interface ProjectData {
  name: string;
  address?: string;
  gcName?: string;
  gcAddress?: string;
  gcContactName?: string;
  initialProposal?: string;
  poNumber?: string;
}

interface CompanyData {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  licenseNumber?: string;
  ownerName?: string;
  accountingManagerName?: string;
  accountingManagerEmail?: string;
}

interface BillingHistory {
  totalProjectValue: number;
  totalCollected: number;
  currentInvoiceAmount: number;
  retainageAmount: number;
  remainingBalance: number;
}

const formatCurrency = (value: string | number | null | undefined): string => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
};

const formatDateShort = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
};

export async function generateInvoicePDF(
  invoice: InvoiceData,
  project: ProjectData,
  company: CompanyData,
  billingHistory: BillingHistory
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = 612;
      const leftMargin = 50;
      const rightMargin = 562;
      const contentWidth = rightMargin - leftMargin;

      // ============ HEADER SECTION ============
      // Company address on left, "Invoice" on right
      doc.fontSize(10).font("Helvetica");

      // Address line
      const companyAddress = company.address || "20441 NE 30th Ave #116, Aventura, FL 33180";
      doc.text(companyAddress, leftMargin, 40, { continued: false });

      // Invoice title on right
      doc.fontSize(18).font("Helvetica-Bold");
      doc.text("Invoice", 450, 40, { align: "right", width: 112 });

      // Invoice number below
      doc.moveDown(0.5);
      doc.fontSize(14).font("Helvetica-Bold");
      doc.text(`#${invoice.invoiceNumber}`, 450, doc.y, { align: "right", width: 112 });

      // License number on left
      doc.fontSize(9).font("Helvetica");
      const licenseNumber = company.licenseNumber || "CGC-1532515";
      doc.text(`LICENSE # ${licenseNumber}`, leftMargin, 75);

      // PROJECT label on right
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("PROJECT", 450, 75, { align: "right", width: 112 });

      // ============ TWO COLUMN SECTION ============
      const columnStartY = 100;
      const leftColX = leftMargin;
      const rightColX = 320;
      const labelWidth = 100;

      // Draw a light box around the two-column section
      doc.rect(leftMargin - 5, columnStartY - 5, contentWidth + 10, 95)
        .lineWidth(0.5)
        .stroke("#cccccc");

      // LEFT COLUMN - Contract Company (GC)
      doc.fontSize(9).font("Helvetica-Bold").fillColor("black");
      doc.text("Contract Company:", leftColX, columnStartY);

      doc.font("Helvetica").fontSize(10);
      const gcName = project.gcName || "";
      const gcAddress = project.gcAddress || "";
      doc.text(gcName, leftColX + 10, columnStartY + 15);

      if (gcAddress) {
        const addressLines = gcAddress.split("\n");
        let yOffset = 28;
        for (const line of addressLines) {
          doc.text(line, leftColX + 10, columnStartY + yOffset);
          yOffset += 12;
        }
      }

      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Attn:", leftColX, columnStartY + 65);
      doc.font("Helvetica").fontSize(10);
      doc.text(project.gcContactName || "", leftColX + 30, columnStartY + 65);

      // RIGHT COLUMN - Project Info
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Name:", rightColX, columnStartY);
      doc.font("Helvetica").fontSize(10);
      doc.text(project.name, rightColX + 45, columnStartY);

      if (project.poNumber || invoice.poNumber) {
        doc.fontSize(9).font("Helvetica-Bold");
        doc.text("PO #", rightColX, columnStartY + 15);
        doc.font("Helvetica").fontSize(10);
        doc.text(project.poNumber || invoice.poNumber || "", rightColX + 45, columnStartY + 15);
      }

      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Location:", rightColX, columnStartY + 35);
      doc.font("Helvetica").fontSize(10);
      const projectAddress = project.address || "";
      doc.text(projectAddress, rightColX + 45, columnStartY + 35, { width: 180 });

      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Date Created:", rightColX, columnStartY + 65);
      doc.font("Helvetica").fontSize(10);
      doc.text(formatDateShort(invoice.invoiceDate), rightColX + 70, columnStartY + 65);

      // ============ DESCRIPTION SECTION ============
      const descriptionY = columnStartY + 110;

      doc.rect(leftMargin - 5, descriptionY - 5, contentWidth + 10, 45)
        .lineWidth(0.5)
        .stroke("#cccccc");

      doc.fontSize(10).font("Helvetica-Bold").fillColor("black");
      doc.text("Description", leftMargin, descriptionY);

      doc.font("Helvetica").fontSize(10);
      const description = `Payment corresponding to project progress ${project.name}`;
      doc.text(description, leftMargin, descriptionY + 18, { width: contentWidth });

      // ============ FINANCIAL BREAKDOWN SECTION ============
      const financeY = descriptionY + 60;

      // Box around financial section
      doc.rect(leftMargin - 5, financeY - 5, contentWidth + 10, 130)
        .lineWidth(0.5)
        .stroke("#cccccc");

      const labelX = leftMargin;
      const valueX = 450;
      let currentY = financeY;
      const lineHeight = 22;

      // Helper to draw a financial row
      const drawFinanceRow = (label: string, value: string, isBold: boolean = false) => {
        if (isBold) {
          doc.fontSize(10).font("Helvetica-Bold");
        } else {
          doc.fontSize(10).font("Helvetica");
        }
        doc.text(label, labelX, currentY);
        doc.text(value, valueX, currentY, { align: "right", width: 100 });
        currentY += lineHeight;
      };

      drawFinanceRow("Total Project Value", formatCurrency(billingHistory.totalProjectValue));
      drawFinanceRow("Total Collected (or Invoiced) from the Project", formatCurrency(billingHistory.totalCollected));

      const retainagePercent = invoice.retainagePercent || "10";
      drawFinanceRow(`Retainage (${retainagePercent}%)`, formatCurrency(billingHistory.retainageAmount));

      drawFinanceRow("Current Invoice Amount (MC and/or CO)", formatCurrency(billingHistory.currentInvoiceAmount), true);
      drawFinanceRow("Remaining Balance", formatCurrency(billingHistory.remainingBalance));

      // ============ FOOTER SECTION ============
      const footerY = financeY + 150;

      // Two column footer
      const footerLeftX = leftMargin;
      const footerRightX = 350;

      // Left side - Company info
      doc.fontSize(10).font("Helvetica-Bold").fillColor("black");
      doc.text(company.name.toUpperCase(), footerLeftX, footerY);

      doc.fontSize(9).font("Helvetica");
      const ownerName = company.ownerName || "Heberto Hernandez";
      const ownerEmail = company.email || "hhb@trebolcontractor.com";
      doc.text(ownerName, footerLeftX, footerY + 15);
      doc.text(ownerEmail, footerLeftX, footerY + 28);

      // Right side - Client
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("CLIENT", footerRightX, footerY);

      // Prepared by section
      const preparedY = footerY + 55;

      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("PREPARED BY", footerLeftX, preparedY);
      doc.text("Date", footerLeftX + 150, preparedY);
      doc.text("PREPARED FOR", footerRightX, preparedY);

      doc.font("Helvetica").fontSize(9);
      const accountingManager = company.accountingManagerName || "Eyli Benitez";
      const accountingEmail = company.accountingManagerEmail || "eyli@trebolcontractor.com";

      doc.text(accountingManager, footerLeftX, preparedY + 15);
      doc.text(formatDateShort(invoice.invoiceDate), footerLeftX + 150, preparedY + 15);
      doc.text(project.gcContactName || "", footerRightX, preparedY + 15);

      doc.text("Accounting Manager", footerLeftX, preparedY + 28);
      doc.text(accountingEmail, footerLeftX, preparedY + 41);

      // Notes (if any)
      if (invoice.notes) {
        doc.moveDown(2);
        doc.fontSize(9).font("Helvetica-Bold").text("Notes:", leftMargin);
        doc.font("Helvetica").text(invoice.notes, leftMargin, doc.y + 5, { width: contentWidth });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Generate invoice PDF by ID
export async function generateInvoicePDFById(
  projectInvoiceId: string
): Promise<{ pdf: Buffer; filename: string }> {
  const invoice = await storage.getProjectInvoice(projectInvoiceId);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const project = await storage.getProject(invoice.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const company = await storage.getCompany(project.companyId);
  if (!company) {
    throw new Error("Company not found");
  }

  // Get GC info if available
  let gcInfo: { name?: string; contactName?: string; address?: string } = {};
  if ((project as any).gcId) {
    const gc = await storage.getGeneralContractor((project as any).gcId);
    if (gc) {
      gcInfo = {
        name: gc.name,
        contactName: gc.contactName || undefined,
        address: gc.address || undefined,
      };
    }
  }

  // Get all invoices for this project to calculate billing history
  const allInvoices = await storage.getProjectInvoices(invoice.projectId);
  const allPayments = await storage.getPaymentsReceived(invoice.projectId);

  // Calculate totals
  const totalProjectValue = parseFloat((project as any).initialProposal || "0");
  const invoiceAmount = parseFloat(invoice.amount);
  const retainageAmount = parseFloat(invoice.retainageAmount || "0");

  // Total collected = sum of all previous invoices (excluding current one)
  const previousInvoices = allInvoices.filter(inv => inv.id !== invoice.id);
  const totalPreviouslyInvoiced = previousInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);

  // Total payments received
  const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  // Remaining balance = total project - all invoiced (including current)
  const totalInvoiced = totalPreviouslyInvoiced + invoiceAmount;
  const remainingBalance = totalProjectValue - totalInvoiced;

  const invoiceData: InvoiceData = {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate || undefined,
    amount: invoice.amount,
    percentBilled: invoice.percentBilled || undefined,
    cumulativePercent: invoice.cumulativePercent || undefined,
    retainagePercent: invoice.retainagePercent || undefined,
    retainageAmount: invoice.retainageAmount || undefined,
    billingType: invoice.billingType || "progress",
    notes: invoice.notes || undefined,
    status: invoice.status,
    poNumber: invoice.poNumber || undefined,
  };

  const projectData: ProjectData = {
    name: project.name,
    address: (project as any).address || undefined,
    gcName: gcInfo.name,
    gcAddress: gcInfo.address,
    gcContactName: gcInfo.contactName,
    initialProposal: (project as any).initialProposal || undefined,
    poNumber: (project as any).poNumber || undefined,
  };

  const companyData: CompanyData = {
    name: company.name,
    address: (company as any).address || "20441 NE 30th Ave #116, Aventura, FL 33180",
    email: company.email || "hhb@trebolcontractor.com",
    phone: (company as any).phone || undefined,
    licenseNumber: (company as any).licenseNumber || "CGC-1532515",
    ownerName: (company as any).ownerName || "Heberto Hernandez",
    accountingManagerName: (company as any).accountingManagerName || "Eyli Benitez",
    accountingManagerEmail: (company as any).accountingManagerEmail || "eyli@trebolcontractor.com",
  };

  const billingHistory: BillingHistory = {
    totalProjectValue,
    totalCollected: totalPreviouslyInvoiced,
    currentInvoiceAmount: invoiceAmount,
    retainageAmount,
    remainingBalance,
  };

  const pdf = await generateInvoicePDF(invoiceData, projectData, companyData, billingHistory);
  const filename = `Invoice_${invoice.invoiceNumber}_${project.name.replace(/\s+/g, "_")}.pdf`;

  return { pdf, filename };
}
