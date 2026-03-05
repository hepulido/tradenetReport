import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Calendar, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/components/company-context";
import { MetricCard } from "@/components/metric-card";
import { TransactionsTable } from "@/components/transactions-table";
import { TransactionsTableSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { Project, Transaction } from "@/lib/types";
import { format } from "date-fns";
import { DollarSign, TrendingUp, Percent } from "lucide-react";

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const projectId = params?.id;

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/projects", projectId, "transactions"],
    enabled: !!projectId,
  });

  const { data: summary } = useQuery<{ cost: number; revenue: number; margin: number }>({
    queryKey: ["/api/projects", projectId, "summary"],
    enabled: !!projectId,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
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

  if (projectLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={DollarSign}
          title="Project Not Found"
          description="The project you're looking for doesn't exist or has been deleted."
          action={{
            label: "Back to Projects",
            onClick: () => navigate("/projects"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold" data-testid="text-project-name">{project.name}</h1>
            <Badge
              variant="secondary"
              className={cn("capitalize", getStatusColor(project.status))}
            >
              {project.status}
            </Badge>
          </div>
          {project.startDate && (
            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">
                {format(new Date(project.startDate), "MMM d, yyyy")}
                {project.endDate && ` - ${format(new Date(project.endDate), "MMM d, yyyy")}`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <MetricCard
          label="Total Cost"
          value={formatCurrency(summary?.cost || 0)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <MetricCard
          label="Revenue"
          value={formatCurrency(summary?.revenue || 0)}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="success"
        />
        <MetricCard
          label="Gross Margin"
          value={formatPercent(summary?.margin || 0)}
          icon={<Percent className="h-4 w-4" />}
          variant={
            (summary?.margin || 0) >= 0.15
              ? "success"
              : (summary?.margin || 0) >= 0
              ? "warning"
              : "danger"
          }
        />
      </div>

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList>
          <TabsTrigger value="transactions" data-testid="tab-transactions">Transactions</TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <TransactionsTableSkeleton />
              ) : (
                <TransactionsTable transactions={transactions || []} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{project.status}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {format(new Date(project.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                {project.startDate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Start Date</p>
                    <p className="font-medium">
                      {format(new Date(project.startDate), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                {project.endDate && (
                  <div>
                    <p className="text-sm text-muted-foreground">End Date</p>
                    <p className="font-medium">
                      {format(new Date(project.endDate), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
