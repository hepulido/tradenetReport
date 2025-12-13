import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderKanban, Calendar, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import { format } from "date-fns";

interface ProjectCardProps {
  project: Project;
  metrics?: {
    cost: number;
    revenue: number;
    margin: number;
  };
  onClick?: () => void;
}

export function ProjectCard({ project, metrics, onClick }: ProjectCardProps) {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "paused":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case "closed":
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400";
      default:
        return "";
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

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <Card
      className={cn(
        "transition-all",
        onClick && "cursor-pointer hover-elevate"
      )}
      onClick={onClick}
      data-testid={`card-project-${project.id}`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-accent p-2">
            <FolderKanban className="h-4 w-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium leading-tight truncate" data-testid={`text-project-name-${project.id}`}>
              {project.name}
            </h3>
            {project.startDate && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>
                  {format(new Date(project.startDate), "MMM d, yyyy")}
                  {project.endDate && ` - ${format(new Date(project.endDate), "MMM d, yyyy")}`}
                </span>
              </div>
            )}
          </div>
        </div>
        <Badge
          variant="secondary"
          className={cn("shrink-0 capitalize", getStatusColor(project.status))}
          data-testid={`badge-status-${project.id}`}
        >
          {project.status}
        </Badge>
      </CardHeader>
      {metrics && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-4 pt-3 border-t">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Cost</p>
              <p className="text-sm font-medium font-mono" data-testid={`text-cost-${project.id}`}>
                {formatCurrency(metrics.cost)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Revenue</p>
              <p className="text-sm font-medium font-mono" data-testid={`text-revenue-${project.id}`}>
                {formatCurrency(metrics.revenue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Margin</p>
              <p
                className={cn(
                  "text-sm font-medium font-mono",
                  metrics.margin >= 0.15
                    ? "text-emerald-600 dark:text-emerald-400"
                    : metrics.margin >= 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                )}
                data-testid={`text-margin-${project.id}`}
              >
                {formatPercent(metrics.margin)}
              </p>
            </div>
          </div>
          {onClick && (
            <Button variant="ghost" size="sm" className="w-full mt-4 gap-2">
              View Details
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
