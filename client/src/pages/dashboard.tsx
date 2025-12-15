import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { DollarSign, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { MetricCard } from "@/components/metric-card";
import { ProjectCard } from "@/components/project-card";
import { AlertItem } from "@/components/alert-item";
import { WeekSelector } from "@/components/week-selector";
import { DashboardSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { ExecutiveSummary } from "@/components/executive-summary";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project, WeeklyReport, ReportSummary, DashboardData } from "@/lib/types";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "projects"],
    enabled: !!selectedCompany,
  });

  const { data: report, isLoading: reportLoading, refetch: refetchReport } = useQuery<WeeklyReport | null>({
    queryKey: ["/api/companies", selectedCompany?.id, "reports", "week", weekStartStr],
    enabled: !!selectedCompany,
  });

  const { data: liveData, isLoading: liveDataLoading } = useQuery<DashboardData>({
    queryKey: ["/api/companies", selectedCompany?.id, `dashboard?weekStart=${weekStartStr}&weekEnd=${weekEndStr}`],
    enabled: !!selectedCompany,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number, revenueZero = false) => {
    if (revenueZero) return "N/A";
    return `${value.toFixed(1)}%`;
  };

  const handleGenerateReport = async () => {
    if (!selectedCompany) return;

    setIsGenerating(true);
    try {
      await apiRequest("POST", `/api/companies/${selectedCompany.id}/reports/weekly`, {
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
      });
      await refetchReport();
      queryClient.invalidateQueries({ queryKey: ["/api/companies", selectedCompany.id, "reports"] });
      toast({
        title: "Report Generated",
        description: "Weekly job cost report has been created successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
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

  if (projectsLoading || reportLoading || liveDataLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <DashboardSkeleton />
      </div>
    );
  }

  const reportSummary = report?.summary as ReportSummary | undefined;
  
  const summary = reportSummary || (liveData ? {
    totalCost: liveData.totalCost,
    totalRevenue: liveData.totalRevenue,
    grossMargin: liveData.grossMargin,
    laborCost: liveData.laborCost,
    materialCost: liveData.materialCost,
    equipmentCost: liveData.equipmentCost,
    otherCost: liveData.totalCost - liveData.laborCost - liveData.materialCost - liveData.equipmentCost,
    alerts: liveData.alerts,
    projects: Object.fromEntries(liveData.projects.map(p => [p.id, { name: p.name, cost: p.cost, revenue: p.revenue, margin: p.margin }]))
  } : undefined);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Weekly job cost overview for {selectedCompany.name}
          </p>
        </div>
        <WeekSelector weekStart={weekStart} onChange={setWeekStart} />
      </div>

      <OnboardingChecklist />

      {summary ? (
        <>
          {liveData?.insights && (
            <ExecutiveSummary
              totalCost={summary.totalCost}
              totalRevenue={summary.totalRevenue}
              grossMargin={summary.grossMargin}
              insights={liveData.insights}
              alerts={summary.alerts || []}
            />
          )}

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

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cost Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Labor</span>
                    <span className="font-mono font-medium">{formatCurrency(summary.laborCost || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Materials</span>
                    <span className="font-mono font-medium">{formatCurrency(summary.materialCost || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Equipment</span>
                    <span className="font-mono font-medium">{formatCurrency(summary.equipmentCost || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Other</span>
                    <span className="font-mono font-medium">{formatCurrency(summary.otherCost || 0)}</span>
                  </div>
                  <div className="border-t pt-4 flex items-center justify-between font-medium">
                    <span>Total</span>
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
                    <p className="text-sm">No alerts for this week</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {summary.projects && Object.keys(summary.projects).length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Cost by Project</h2>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(summary.projects).map(([projectId, metrics]) => {
                  const project = projects?.find((p) => p.id === projectId);
                  if (!project) return null;
                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      metrics={{
                        cost: metrics.cost,
                        revenue: metrics.revenue,
                        margin: metrics.margin,
                      }}
                      onClick={() => navigate(`/projects/${project.id}`)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Report for This Week</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Generate a weekly job cost report to see total costs, revenue, margins, and alerts.
              </p>
              <Button onClick={handleGenerateReport} disabled={isGenerating} data-testid="button-generate-report">
                {isGenerating ? "Generating..." : "Generate Weekly Report"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
