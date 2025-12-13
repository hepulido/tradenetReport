import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileBarChart, Calendar, Download, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { ReportsSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WeeklyReport, ReportSummary } from "@/lib/types";
import { format, startOfWeek } from "date-fns";
import { useLocation } from "wouter";

export default function Reports() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: reports, isLoading } = useQuery<WeeklyReport[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "reports"],
    enabled: !!selectedCompany,
  });

  const handleGenerateReport = async () => {
    if (!selectedCompany) return;

    setIsGenerating(true);
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

    try {
      await apiRequest("POST", `/api/companies/${selectedCompany.id}/reports/weekly`, {
        weekStart,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany.id, "reports"],
      });
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

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={FileBarChart}
          title="No Company Selected"
          description="Please select or create a company to view reports."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-reports-title">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Weekly job cost reports for {selectedCompany.name}
          </p>
        </div>
        <Button onClick={handleGenerateReport} disabled={isGenerating} data-testid="button-generate-report">
          <Plus className="h-4 w-4 mr-2" />
          {isGenerating ? "Generating..." : "Generate Report"}
        </Button>
      </div>

      {isLoading ? (
        <ReportsSkeleton />
      ) : reports && reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report) => {
            const summary = report.summary as ReportSummary;
            return (
              <Card
                key={report.id}
                className="hover-elevate cursor-pointer"
                onClick={() => navigate(`/reports/${report.id}`)}
                data-testid={`card-report-${report.id}`}
              >
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center gap-4">
                    <div className="rounded-md bg-accent p-3 shrink-0">
                      <FileBarChart className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">
                          Week of {format(new Date(report.weekStart), "MMM d")} -{" "}
                          {format(new Date(report.weekEnd), "MMM d, yyyy")}
                        </h3>
                        {summary?.alerts && summary.alerts.length > 0 && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            {summary.alerts.length} Alert{summary.alerts.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Cost: {formatCurrency(summary?.totalCost || 0)}</span>
                        <span>Revenue: {formatCurrency(summary?.totalRevenue || 0)}</span>
                        <span className={!summary?.totalRevenue ? "text-muted-foreground" : summary?.grossMargin >= 15 ? "text-emerald-600 dark:text-emerald-400" : summary?.grossMargin >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                          Margin: {formatPercent(summary?.grossMargin || 0, !summary?.totalRevenue)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={FileBarChart}
          title="No Reports Yet"
          description="Generate your first weekly job cost report to track costs, revenue, and margins."
          action={{
            label: "Generate Report",
            onClick: handleGenerateReport,
          }}
        />
      )}
    </div>
  );
}
