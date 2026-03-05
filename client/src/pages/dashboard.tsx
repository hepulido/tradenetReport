import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  DollarSign,
  AlertTriangle,
  Building2,
  FileText,
  Receipt,
  ArrowRight,
  CheckCircle2,
  Clock,
  Wallet,
  Percent,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCompany } from "@/components/company-context";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface PortfolioSummary {
  ok: boolean;
  totalInitialContract: number;
  totalApprovedCOs: number;
  totalContractValue: number;
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  activeProjectCount: number;
  totalProjectCount: number;
  pendingCOCount: number;
  pendingCOValue: number;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: string;
    invoiceDate: string;
    projectName: string;
    projectId: string;
    status: string;
  }>;
  recentPayments: Array<{
    id: string;
    amount: string;
    paymentDate: string;
    paymentMethod: string | null;
    referenceNumber: string | null;
    projectName: string;
    projectId: string;
  }>;
  projectsNeedingAttention: Array<{
    id: string;
    name: string;
    reason: string;
    value?: number;
  }>;
}

export default function Dashboard() {
  const { selectedCompany } = useCompany();
  const [, navigate] = useLocation();

  const { data: portfolio, isLoading } = useQuery<PortfolioSummary>({
    queryKey: [`/api/companies/${selectedCompany?.id}/portfolio-summary`],
    enabled: !!selectedCompany,
  });

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatFullCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={BarChart3}
          title="No Company Selected"
          description="Please select or create a company to view the dashboard."
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const billingProgress = portfolio && portfolio.totalContractValue > 0
    ? (portfolio.totalBilled / portfolio.totalContractValue) * 100
    : 0;

  const collectionProgress = portfolio && portfolio.totalBilled > 0
    ? (portfolio.totalCollected / portfolio.totalBilled) * 100
    : 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Portfolio overview for {selectedCompany.name}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          <Building2 className="h-4 w-4 mr-2" />
          View All Projects
        </Button>
      </div>


      {portfolio && (
        <>
          {/* Portfolio Overview Cards */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Contract Value */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Total Contract Value</span>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold">
                  {formatCurrency(portfolio.totalContractValue)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatFullCurrency(portfolio.totalInitialContract)} initial
                  {portfolio.totalApprovedCOs > 0 && (
                    <span className="text-emerald-600"> + {formatFullCurrency(portfolio.totalApprovedCOs)} COs</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Total Billed */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Total Billed</span>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold text-blue-600">
                  {formatCurrency(portfolio.totalBilled)}
                </div>
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{billingProgress.toFixed(0)}% of contract</span>
                  </div>
                  <Progress value={billingProgress} className="h-1.5" />
                </div>
              </CardContent>
            </Card>

            {/* Total Collected */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Total Collected</span>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-3xl font-bold text-emerald-600">
                  {formatCurrency(portfolio.totalCollected)}
                </div>
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{collectionProgress.toFixed(0)}% of billed</span>
                  </div>
                  <Progress
                    value={collectionProgress}
                    className={cn(
                      "h-1.5",
                      collectionProgress >= 80 ? "[&>div]:bg-emerald-500" :
                      collectionProgress >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Outstanding */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Outstanding</span>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className={cn(
                  "text-3xl font-bold",
                  portfolio.totalOutstanding > 0 ? "text-amber-600" : "text-muted-foreground"
                )}>
                  {formatCurrency(portfolio.totalOutstanding)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {portfolio.totalContractValue > portfolio.totalBilled && (
                    <span>{formatFullCurrency(portfolio.totalContractValue - portfolio.totalBilled)} unbilled</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats Row */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{portfolio.activeProjectCount}</p>
                  <p className="text-xs text-muted-foreground">Active Projects</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Percent className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{portfolio.collectionRate.toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">Collection Rate</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{portfolio.pendingCOCount}</p>
                  <p className="text-xs text-muted-foreground">Pending COs</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center",
                  portfolio.pendingCOValue > 0
                    ? "bg-amber-100 dark:bg-amber-900/30"
                    : "bg-muted"
                )}>
                  <DollarSign className={cn(
                    "h-5 w-5",
                    portfolio.pendingCOValue > 0 ? "text-amber-600" : "text-muted-foreground"
                  )} />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {portfolio.pendingCOValue > 0 ? formatCurrency(portfolio.pendingCOValue) : "$0"}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending CO Value</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Section */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Recent Invoices */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Recent Invoices
                </CardTitle>
              </CardHeader>
              <CardContent>
                {portfolio.recentInvoices.length > 0 ? (
                  <div className="space-y-3">
                    {portfolio.recentInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/projects/${invoice.projectId}/crm`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium",
                            invoice.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                            invoice.status === "sent" ? "bg-blue-100 text-blue-700" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {invoice.status === "paid" ? <CheckCircle2 className="h-4 w-4" /> :
                             invoice.status === "sent" ? <ArrowRight className="h-4 w-4" /> :
                             <Clock className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="font-medium text-sm">#{invoice.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground">{invoice.projectName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatFullCurrency(parseFloat(invoice.amount))}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(invoice.invoiceDate), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No invoices yet</p>
                    <p className="text-xs">Create your first invoice from a project</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Payments */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-600" />
                  Recent Payments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {portfolio.recentPayments.length > 0 ? (
                  <div className="space-y-3">
                    {portfolio.recentPayments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/projects/${payment.projectId}/crm`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <DollarSign className="h-4 w-4 text-emerald-700" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {payment.referenceNumber ? `Check #${payment.referenceNumber}` : payment.paymentMethod || "Payment"}
                            </p>
                            <p className="text-xs text-muted-foreground">{payment.projectName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-emerald-600">+{formatFullCurrency(parseFloat(payment.amount))}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(payment.paymentDate), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No payments recorded</p>
                    <p className="text-xs">Upload checks or record payments from projects</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Attention Section */}
          {portfolio.projectsNeedingAttention.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  Needs Attention
                </CardTitle>
                <CardDescription>
                  Projects that may require your review
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {portfolio.projectsNeedingAttention.map((project) => (
                    <div
                      key={project.id + project.reason}
                      className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-background border hover:border-primary/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/projects/${project.id}/crm`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                          <AlertTriangle className="h-4 w-4 text-amber-700" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{project.name}</p>
                          <p className="text-xs text-muted-foreground">{project.reason}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {project.value && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {formatFullCurrency(project.value)}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </>
      )}
    </div>
  );
}
