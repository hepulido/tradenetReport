// CSV/Excel export utilities

/**
 * Convert array of objects to CSV string
 */
export function toCSV(data: Record<string, any>[], columns?: { key: string; label: string }[]): string {
  if (!data.length) return "";

  // Get headers
  const headers = columns
    ? columns.map((c) => c.label)
    : Object.keys(data[0]);
  const keys = columns
    ? columns.map((c) => c.key)
    : Object.keys(data[0]);

  // Build CSV rows
  const rows = data.map((item) =>
    keys.map((key) => {
      const value = item[key];
      // Handle null/undefined
      if (value === null || value === undefined) return "";
      // Handle strings with commas, quotes, or newlines
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Download data as CSV file
 */
export function downloadCSV(data: Record<string, any>[], filename: string, columns?: { key: string; label: string }[]): void {
  const csv = toCSV(data, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download data as JSON file
 */
export function downloadJSON(data: any, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Predefined column mappings for common exports
export const EXPORT_COLUMNS = {
  transactions: [
    { key: "txnDate", label: "Date" },
    { key: "type", label: "Type" },
    { key: "direction", label: "Direction" },
    { key: "amount", label: "Amount" },
    { key: "vendor", label: "Vendor" },
    { key: "category", label: "Category" },
    { key: "description", label: "Description" },
    { key: "memo", label: "Memo" },
  ],
  invoices: [
    { key: "invoiceNumber", label: "Invoice #" },
    { key: "invoiceDate", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "status", label: "Status" },
    { key: "dueDate", label: "Due Date" },
    { key: "notes", label: "Notes" },
  ],
  changeOrders: [
    { key: "coNumber", label: "CO #" },
    { key: "poNumber", label: "PO #" },
    { key: "description", label: "Description" },
    { key: "amount", label: "Amount" },
    { key: "status", label: "Status" },
    { key: "dateSubmitted", label: "Date Submitted" },
    { key: "dateApproved", label: "Date Approved" },
  ],
  payroll: [
    { key: "workerName", label: "Worker" },
    { key: "projectName", label: "Project" },
    { key: "weekStart", label: "Week Start" },
    { key: "weekEnd", label: "Week End" },
    { key: "daysWorked", label: "Days Worked" },
    { key: "dailyRate", label: "Daily Rate" },
    { key: "basePay", label: "Base Pay" },
    { key: "parking", label: "Parking" },
    { key: "overtimeHours", label: "OT Hours" },
    { key: "overtimePay", label: "OT Pay" },
    { key: "bonus", label: "Bonus" },
    { key: "deductions", label: "Deductions" },
    { key: "totalPay", label: "Total Pay" },
  ],
  projects: [
    { key: "name", label: "Project Name" },
    { key: "status", label: "Status" },
    { key: "address", label: "Address" },
    { key: "contractValue", label: "Contract Value" },
    { key: "changeOrdersTotal", label: "Change Orders" },
    { key: "totalInvoiced", label: "Total Invoiced" },
    { key: "totalPaid", label: "Total Paid" },
    { key: "percentComplete", label: "% Complete" },
  ],
  payments: [
    { key: "paymentDate", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "paymentMethod", label: "Method" },
    { key: "referenceNumber", label: "Reference #" },
    { key: "bankDeposited", label: "Bank" },
    { key: "notes", label: "Notes" },
  ],
};

/**
 * Format date for export
 */
export function formatDateForExport(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US");
}

/**
 * Format currency for export
 */
export function formatCurrencyForExport(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toFixed(2);
}
