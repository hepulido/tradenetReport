import PDFDocument from "pdfkit";
import { storage } from "./storage";

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  amount: string;
  percentBilled?: string;
  retainagePercent?: string;
  retainageAmount?: string;
  billingType: string;
  notes?: string;
  status: string;
}

interface ProjectData {
  name: string;
  address?: string;
  gcName?: string;
  gcContactName?: string;
  initialProposal?: string;
}

interface CompanyData {
  name: string;
  email?: string;
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

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export async function generateInvoicePDF(
  invoice: InvoiceData,
  project: ProjectData,
  company: CompanyData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 50,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header - Company Name
      doc.fontSize(24).font("Helvetica-Bold").text(company.name, { align: "left" });
      if (company.email) {
        doc.fontSize(10).font("Helvetica").text(company.email);
      }
      doc.moveDown(0.5);

      // Invoice Title
      doc.fontSize(18).font("Helvetica-Bold").text("INVOICE", { align: "right" });
      doc.moveDown(0.3);

      // Invoice Details Box (right side)
      const rightX = 400;
      const detailsY = doc.y;

      doc.fontSize(10).font("Helvetica");
      doc.text(`Invoice #: ${invoice.invoiceNumber}`, rightX);
      doc.text(`Date: ${formatDate(invoice.invoiceDate)}`, rightX);
      if (invoice.dueDate) {
        doc.text(`Due Date: ${formatDate(invoice.dueDate)}`, rightX);
      }
      doc.text(`Status: ${invoice.status.toUpperCase()}`, rightX);

      doc.moveDown(2);

      // Bill To Section
      doc.fontSize(12).font("Helvetica-Bold").text("BILL TO:");
      doc.fontSize(10).font("Helvetica");
      if (project.gcName) {
        doc.text(project.gcName);
      }
      if (project.gcContactName) {
        doc.text(`Attn: ${project.gcContactName}`);
      }

      doc.moveDown(1);

      // Project Details
      doc.fontSize(12).font("Helvetica-Bold").text("PROJECT:");
      doc.fontSize(10).font("Helvetica");
      doc.text(project.name);
      if (project.address) {
        doc.text(project.address);
      }

      doc.moveDown(2);

      // Line separator
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      // Invoice Line Items Header
      const tableTop = doc.y;
      const col1 = 50;  // Description
      const col2 = 350; // Percent
      const col3 = 430; // Amount

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Description", col1, tableTop);
      doc.text("Percent", col2, tableTop);
      doc.text("Amount", col3, tableTop);

      doc.moveTo(50, doc.y + 3).lineTo(562, doc.y + 3).stroke();
      doc.moveDown(0.8);

      // Line item
      doc.font("Helvetica");
      const itemY = doc.y;
      const billingTypeLabel = getBillingTypeLabel(invoice.billingType);

      doc.text(billingTypeLabel, col1, itemY, { width: 280 });
      if (invoice.percentBilled) {
        doc.text(`${invoice.percentBilled}%`, col2, itemY);
      }
      doc.text(formatCurrency(invoice.amount), col3, itemY);

      doc.moveDown(1);

      // Line separator
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      // Subtotal
      const subtotalY = doc.y;
      doc.font("Helvetica-Bold").text("Subtotal", 350, subtotalY);
      doc.text(formatCurrency(invoice.amount), col3, subtotalY);
      doc.moveDown(0.5);

      // Retainage (if applicable)
      if (invoice.retainageAmount && parseFloat(invoice.retainageAmount) > 0) {
        const retainageY = doc.y;
        doc.font("Helvetica").text(`Retainage (${invoice.retainagePercent || "10"}%)`, 350, retainageY);
        doc.text(`(${formatCurrency(invoice.retainageAmount)})`, col3, retainageY);
        doc.moveDown(0.5);

        // Net Amount
        const netAmount = parseFloat(invoice.amount) - parseFloat(invoice.retainageAmount);
        const netY = doc.y;
        doc.moveTo(350, netY - 3).lineTo(562, netY - 3).stroke();
        doc.moveDown(0.3);
        doc.font("Helvetica-Bold").text("NET AMOUNT DUE", 350, doc.y);
        doc.fontSize(12).text(formatCurrency(netAmount), col3, doc.y - 14);
      } else {
        // Total
        doc.moveTo(350, doc.y - 3).lineTo(562, doc.y - 3).stroke();
        doc.moveDown(0.3);
        doc.font("Helvetica-Bold").text("TOTAL DUE", 350, doc.y);
        doc.fontSize(12).text(formatCurrency(invoice.amount), col3, doc.y - 14);
      }

      doc.moveDown(3);

      // Notes section
      if (invoice.notes) {
        doc.fontSize(10).font("Helvetica-Bold").text("Notes:");
        doc.font("Helvetica").text(invoice.notes);
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).font("Helvetica")
        .fillColor("gray")
        .text("Thank you for your business!", { align: "center" });
      doc.text(`Generated by JobCost AI on ${new Date().toLocaleDateString()}`, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function getBillingTypeLabel(billingType: string): string {
  switch (billingType) {
    case "progress":
      return "Progress Billing - Work Completed";
    case "change_order":
      return "Change Order Billing";
    case "labor":
      return "Labor Billing";
    case "final":
      return "Final Billing";
    case "retainage":
      return "Retainage Release";
    default:
      return "Invoice";
  }
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
  let gcInfo: { name?: string; contactName?: string } = {};
  if ((project as any).gcId) {
    const gc = await storage.getGeneralContractor((project as any).gcId);
    if (gc) {
      gcInfo = { name: gc.name, contactName: gc.contactName || undefined };
    }
  }

  const invoiceData: InvoiceData = {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate || undefined,
    amount: invoice.amount,
    percentBilled: invoice.percentBilled || undefined,
    retainagePercent: invoice.retainagePercent || undefined,
    retainageAmount: invoice.retainageAmount || undefined,
    billingType: invoice.billingType || "progress",
    notes: invoice.notes || undefined,
    status: invoice.status,
  };

  const projectData: ProjectData = {
    name: project.name,
    address: (project as any).address || undefined,
    gcName: gcInfo.name,
    gcContactName: gcInfo.contactName,
    initialProposal: (project as any).initialProposal || undefined,
  };

  const companyData: CompanyData = {
    name: company.name,
    email: company.email || undefined,
  };

  const pdf = await generateInvoicePDF(invoiceData, projectData, companyData);
  const filename = `Invoice_${invoice.invoiceNumber}_${project.name.replace(/\s+/g, "_")}.pdf`;

  return { pdf, filename };
}
