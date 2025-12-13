import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardInsights } from "@/lib/types";

interface ExecutiveSummaryProps {
  totalCost: number;
  totalRevenue: number;
  grossMargin: number;
  insights: DashboardInsights;
  alerts: string[];
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}

export function ExecutiveSummary({ totalCost, totalRevenue, grossMargin, insights, alerts }: ExecutiveSummaryProps) {
  const { costChangePercent, laborCostPercent, lowMarginProjects, previousWeekCost } = insights;
  
  const hasCriticalAlerts = alerts.length > 0;
  const costDiff = totalCost - previousWeekCost;
  const costTrend = costChangePercent > 0 ? "up" : costChangePercent < 0 ? "down" : "flat";

  return (
    <Card className="border-l-4 border-l-primary" data-testid="card-executive-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          This Week Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          {costTrend === "up" ? (
            <TrendingUp className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          ) : costTrend === "down" ? (
            <TrendingDown className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          ) : (
            <Minus className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          )}
          <span className="text-sm" data-testid="text-cost-summary">
            {previousWeekCost > 0 ? (
              <>
                Total spend {costTrend === "up" ? "up" : costTrend === "down" ? "down" : "flat"}{" "}
                <span className="font-mono font-medium">{formatCurrency(Math.abs(costDiff))}</span>{" "}
                <span className={costTrend === "up" ? "text-destructive" : costTrend === "down" ? "text-emerald-600" : ""}>
                  ({formatPercent(costChangePercent)})
                </span>
              </>
            ) : (
              <>Total spend this week: <span className="font-mono font-medium">{formatCurrency(totalCost)}</span></>
            )}
          </span>
        </div>

        {totalCost > 0 && (
          <div className="flex items-start gap-2">
            <div className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-muted-foreground" data-testid="text-labor-summary">
              Labor accounted for <span className="font-medium text-foreground">{laborCostPercent.toFixed(0)}%</span> of costs
            </span>
          </div>
        )}

        {lowMarginProjects.length > 0 && (
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm" data-testid="text-margin-warning">
              {lowMarginProjects.length === 1 ? (
                <>
                  <span className="font-medium">{lowMarginProjects[0].name}</span> margin below target ({lowMarginProjects[0].margin.toFixed(0)}%)
                </>
              ) : (
                <>
                  <span className="font-medium">{lowMarginProjects.length} projects</span> with margins below 25% target
                </>
              )}
            </span>
          </div>
        )}

        {totalRevenue > 0 && grossMargin < 25 && (
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm" data-testid="text-overall-margin">
              Overall margin at <span className="font-medium">{grossMargin.toFixed(1)}%</span> (target: 25%+)
            </span>
          </div>
        )}

        {!hasCriticalAlerts && totalCost > 0 && (
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-muted-foreground" data-testid="text-no-alerts">
              No projects exceeded critical risk thresholds
            </span>
          </div>
        )}

        {totalCost === 0 && totalRevenue === 0 && (
          <div className="text-sm text-muted-foreground">
            No transactions recorded for this week yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
