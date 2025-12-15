export type Company = {
  id: string;
  name: string;
  email: string | null;
  timezone: string;
  createdAt: string;
};

export type Project = {
  id: string;
  companyId: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
};

export type Transaction = {
  id: string;
  companyId: string;
  projectId: string | null;
  vendorId: string | null;
  type: string;
  direction: string;
  amount: string;
  currency: string;
  txnDate: string;
  category: string | null;
  description: string | null;
  memo: string | null;
  vendor: string | null;
  source: string;
  sourceRef: string | null;
  createdAt: string;
};

export type LaborEntry = {
  id: string;
  companyId: string;
  projectId: string | null;
  workerName: string | null;
  role: string | null;
  hours: string;
  rate: string | null;
  laborDate: string;
  source: string;
  sourceRef: string | null;
  createdAt: string;
};

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

export type WeeklyReport = {
  id: string;
  companyId: string;
  weekStart: string;
  weekEnd: string;
  summary: ReportSummary;
  pdfUrl: string | null;
  createdAt: string;
};

export type ImportFile = {
  id: string;
  companyId: string;
  filename: string | null;
  source: string;
  status: string;
  uploadedAt: string;
};

export type ImportRow = {
  id: string;
  importFileId: string;
  rawData: Record<string, unknown> | null;
  mapped: boolean;
  createdAt: string;
};

export type DashboardInsights = {
  costChangePercent: number;
  laborCostPercent: number;
  materialCostPercent: number;
  equipmentCostPercent: number;
  lowMarginProjects: { name: string; margin: number }[];
  largeTransactions: { description: string; amount: number; vendor: string | null }[];
  previousWeekCost: number;
};

export type DashboardData = {
  totalCost: number;
  totalRevenue: number;
  grossMargin: number;
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  alerts: string[];
  projects: { id: string; name: string; cost: number; revenue: number; margin: number; status: string }[];
  insights: DashboardInsights;
};

export type IngestionJob = {
  id: string;
  companyId: string;
  sourceType: string;
  filename: string | null;
  fileUrl: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type IngestionResult = {
  id: string;
  ingestionJobId: string;
  rawText: string | null;
  extractedJson: Record<string, unknown> | null;
  confidenceScore: string | null;
  status: string;
  createdAt: string;
  approvedAt: string | null;
};

export type IngestionJobWithResults = IngestionJob & {
  results: IngestionResult[];
};
