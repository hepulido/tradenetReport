import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Download, Calendar, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompany } from "@/components/company-context";
import { MetricCard } from "@/components/metric-card";
import { AlertItem } from "@/components/alert-item";
import { EmptyState } from "@/components/empty-state";
import { ExecutiveSummary } from "@/components/executive-summary";
import { cn } from "@/lib/utils";
import type { WeeklyReport, ReportSummary, Project, DashboardInsights } from "@/lib/types";
import { format } from "date-fns";

export default function ReportDetail() {
  const [, params] = useRoute("/reports/:id");
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const reportId = params?.id;

  const { data: report, isLoading } = useQuery<WeeklyReport>({
    queryKey: ["/api/reports", reportId],
    enabled: !!reportId,
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "projects"],
    enabled: !!selectedCompany,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number, revenueZero = false) => {
    if (revenueZero) return "N/A";
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={DollarSign}
          title="Report Not Found"
          description="The report you're looking for doesn't exist or has been deleted."
          action={{
            label: "Back to Reports",
            onClick: () => navigate("/reports"),
          }}
        />
      </div>
    );
  }

  const summary = report.summary as ReportSummary;

  const reportInsights: DashboardInsights = {
    costChangePercent: 0,
    laborCostPercent: summary.totalCost > 0 ? (summary.laborCost / summary.totalCost) * 100 : 0,
    materialCostPercent: summary.totalCost > 0 ? (summary.materialCost / summary.totalCost) * 100 : 0,
    equipmentCostPercent: summary.totalCost > 0 ? (summary.equipmentCost / summary.totalCost) * 100 : 0,
    lowMarginProjects: Object.entries(summary.projects || {})
      .filter(([_, p]) => p.revenue > 0 && p.margin < 25)
      .map(([name, p]) => ({ name, margin: p.margin })),
    largeTransactions: [],
    previousWeekCost: 0
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/reports")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-report-title">
              Weekly Report
            </h1>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {format(new Date(report.weekStart), "MMM d")} -{" "}
                {format(new Date(report.weekEnd), "MMM d, yyyy")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ExecutiveSummary
        totalCost={summary.totalCost}
        totalRevenue={summary.totalRevenue}
        grossMargin={summary.grossMargin}
        insights={reportInsights}
        alerts={summary.alerts || []}
      />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Cost"
          value={formatCurrency(summary.totalCost)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <MetricCard
          label="Revenue"
          value={formatCurrency(summary.totalRevenue)}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="success"
        />
        <MetricCard
          label="Gross Margin"
          value={formatPercent(summary.grossMargin, summary.totalRevenue === 0)}
          variant={summary.totalRevenue === 0 ? "default" : summary.grossMargin >= 15 ? "success" : summary.grossMargin >= 0 ? "warning" : "danger"}
        />
        <MetricCard
          label="Alerts"
          value={String(summary.alerts?.length || 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant={summary.alerts?.length > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Labor</span>
                <span className="font-mono font-medium">{formatCurrency(summary.laborCost || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Materials</span>
                <span className="font-mono font-medium">{formatCurrency(summary.materialCost || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Equipment</span>
                <span className="font-mono font-medium">{formatCurrency(summary.equipmentCost || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Other</span>
                <span className="font-mono font-medium">{formatCurrency(summary.otherCost || 0)}</span>
              </div>
              <div className="border-t pt-4 flex items-center justify-between font-semibold">
                <span>Total Cost</span>
                <span className="font-mono">{formatCurrency(summary.totalCost)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.alerts && summary.alerts.length > 0 ? (
              <div className="space-y-3">
                {summary.alerts.map((alert, index) => (
                  <AlertItem
                    key={index}
                    message={alert}
                    type={alert.toLowerCase().includes("below") ? "danger" : "warning"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No alerts for this report</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.projects && Object.keys(summary.projects).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cost by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(summary.projects).map(([projectName, metrics]) => (
                <div
                  key={projectName}
                  className="flex items-center justify-between py-3 border-b last:border-0"
                >
                  <div>
                    <p className="font-medium">{projectName}</p>
                    <p className="text-sm text-muted-foreground">
                      Revenue: {formatCurrency(metrics.revenue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-medium">{formatCurrency(metrics.cost)}</p>
                    <p
                      className={cn(
                        "text-sm font-mono",
                        metrics.revenue === 0
                          ? "text-muted-foreground"
                          : metrics.margin >= 15
                          ? "text-emerald-600 dark:text-emerald-400"
                          : metrics.margin >= 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatPercent(metrics.margin, metrics.revenue === 0)} margin
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
