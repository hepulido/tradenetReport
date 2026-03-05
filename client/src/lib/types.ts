export type Company = {
  id: string;
  name: string;
  email: string | null;
  timezone: string;
  ingestionEmailAlias?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  trialEndsAt?: string | Date | null;
  createdAt: string | Date;
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

// ========== Construction CRM Types ==========

export type GeneralContractor = {
  id: string;
  companyId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTermsDays: string | null;
  invoiceDueDay: string | null;
  billingMethod: string | null;
  retentionPercent: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ChangeOrder = {
  id: string;
  companyId: string;
  projectId: string;
  gcId: string | null;
  coNumber: string;
  poNumber: string | null;
  description: string | null;
  amount: string;
  dateSubmitted: string | null;
  dateApproved: string | null;
  status: string;
  invoicedInId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInvoice = {
  id: string;
  companyId: string;
  projectId: string;
  gcId: string | null;
  invoiceNumber: string;
  poNumber: string | null;
  invoiceDate: string;
  amount: string;
  percentBilled: string | null;
  cumulativePercent: string | null;
  // Retainage tracking
  retainagePercent: string | null;
  retainageAmount: string | null;
  retainageReleased: boolean;
  retainageReleasedDate: string | null;
  includesChangeOrders: string[] | null;
  billingType: string | null;
  status: string;
  dueDate: string | null;
  submittedVia: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentReceived = {
  id: string;
  companyId: string;
  projectId: string;
  projectInvoiceId: string | null;
  amount: string;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  bankDeposited: string | null;
  notes: string | null;
  createdAt: string;
};

export type Worker = {
  id: string;
  companyId: string;
  name: string;
  dailyRate: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  workerType: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollEntry = {
  id: string;
  companyId: string;
  workerId: string;
  projectId: string;
  weekStart: string;
  weekEnd: string;
  daysWorked: string;
  dailyRate: string;
  basePay: string;
  parking: string | null;
  overtimeHours: string | null;
  overtimePay: string | null;
  bonus: string | null;
  deductions: string | null;
  deductionNotes: string | null;
  totalPay: string;
  source: string | null;
  sourceRef: string | null;
  notes: string | null;
  createdAt: string;
};

export type ProjectWithDetails = Project & {
  gcId: string | null;
  address: string | null;
  pocName: string | null;
  pocPhone: string | null;
  pocEmail: string | null;
  initialProposal: string | null;
  noticeToOwner: boolean;
  percentComplete: string | null;
  notes: string | null;
  updatedAt: string;
  // Computed fields from API
  gc?: GeneralContractor;
  totalChangeOrders?: number;
  finalContract?: number;
  totalInvoiced?: number;
  totalPaid?: number;
  totalMaterialCost?: number;
  totalLaborCost?: number;
};

export type ProjectFinancials = {
  contractValue: number;
  changeOrdersTotal: number;
  finalContract: number;
  percentComplete: number;
  // Revenue side
  totalInvoiced: number;
  totalPaid: number;
  outstandingAR: number;
  // Retainage tracking
  retainageHeld: number;
  retainageReleased: number;
  retainagePending: number; // retainageHeld - retainageReleased
  // Cost side
  materialCosts: number;
  laborCosts: number;
  totalCosts: number;
  // Profit
  grossProfit: number;
  grossMargin: number;
  // Projected
  projectedProfit: number;
  projectedMargin: number;
};

// ========== Budget / Takeoff Types ==========

export type ProjectBudget = {
  id: string;
  projectId: string;
  companyId: string;
  name: string;
  contractValue: string;
  estimatedCost: string | null;
  estimatedProfit: string | null;
  estimatedMargin: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BudgetLineItem = {
  id: string;
  budgetId: string;
  companyId: string;
  category: string;
  description: string;
  quantity: string | null;
  unit: string | null;
  unitCost: string | null;
  totalCost: string;
  quantityUsed: string | null;
  costToDate: string | null;
  variance: string | null;
  notes: string | null;
  createdAt: string;
};

// ========== Vendor Expense Types ==========

export type VendorExpense = {
  id: string;
  companyId: string;
  projectId: string | null;
  vendorId: string | null;
  vendorName: string;
  date: string;
  description: string;
  amount: string;
  category: string | null;
  receiptUrl: string | null;
  sourceJobId: string | null;
  createdAt: string;
};

// ========== Estimates/Proposals ==========

export type Estimate = {
  id: string;
  companyId: string;
  gcId: string | null;
  estimateNumber: string;
  name: string;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  projectAddress: string | null;
  scopeOfWork: string | null;
  laborCost: string | null;
  materialCost: string | null;
  equipmentCost: string | null;
  overhead: string | null;
  profit: string | null;
  totalAmount: string;
  estimateDate: string;
  validUntil: string | null;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  convertedToProjectId: string | null;
  paymentTerms: string | null;
  inclusions: string | null;
  exclusions: string | null;
  notes: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EstimateLineItem = {
  id: string;
  estimateId: string;
  description: string;
  category: string | null;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  totalPrice: string;
  notes: string | null;
  sortOrder: string | null;
  createdAt: string;
};

export type EstimateWithLineItems = Estimate & {
  lineItems: EstimateLineItem[];
  gc?: GeneralContractor;
};
