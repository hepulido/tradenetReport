import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

export function MetricCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  variant = "default",
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0) return <TrendingUp className="h-3 w-3" />;
    if (trend < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = () => {
    if (trend === undefined) return "";
    if (variant === "success" || (variant === "default" && trend > 0))
      return "text-emerald-600 dark:text-emerald-400";
    if (variant === "danger" || (variant === "default" && trend < 0))
      return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const getValueColor = () => {
    switch (variant) {
      case "success":
        return "text-emerald-600 dark:text-emerald-400";
      case "warning":
        return "text-amber-600 dark:text-amber-400";
      case "danger":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-foreground";
    }
  };

  return (
    <Card data-testid={`card-metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <div className="mt-3">
          <span
            className={cn(
              "text-2xl font-bold tracking-tight font-mono",
              getValueColor()
            )}
            data-testid={`text-metric-value-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {value}
          </span>
        </div>
        {(trend !== undefined || trendLabel) && (
          <div className={cn("mt-2 flex items-center gap-1 text-xs", getTrendColor())}>
            {getTrendIcon()}
            {trend !== undefined && (
              <span className="font-medium">
                {trend > 0 ? "+" : ""}
                {trend.toFixed(1)}%
              </span>
            )}
            {trendLabel && (
              <span className="text-muted-foreground ml-1">{trendLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
