import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Circle, Rocket, FolderPlus, Upload, FileBarChart } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCompany } from "@/components/company-context";
import type { Project, WeeklyReport, ImportFile } from "@/lib/types";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  icon: typeof CheckCircle;
  completed: boolean;
  href: string;
  actionLabel: string;
}

export function OnboardingChecklist() {
  const { selectedCompany } = useCompany();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "projects"],
    enabled: !!selectedCompany,
  });

  const { data: reports } = useQuery<WeeklyReport[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "reports"],
    enabled: !!selectedCompany,
  });

  const { data: transactions } = useQuery<unknown[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "transactions"],
    enabled: !!selectedCompany,
  });

  const hasProjects = projects && projects.length > 0;
  const hasImportedData = transactions && transactions.length > 0;
  const hasReports = reports && reports.length > 0;

  const items: ChecklistItem[] = [
    {
      id: "create-project",
      title: "Create your first project",
      description: "Add a construction project to track costs and revenue",
      icon: FolderPlus,
      completed: !!hasProjects,
      href: "/projects",
      actionLabel: "Create Project",
    },
    {
      id: "import-data",
      title: "Upload transaction data",
      description: "Import a CSV or Excel file with your financial data",
      icon: Upload,
      completed: !!hasImportedData,
      href: "/upload",
      actionLabel: "Upload File",
    },
    {
      id: "generate-report",
      title: "Generate your first report",
      description: "Create a weekly job cost report with insights",
      icon: FileBarChart,
      completed: !!hasReports,
      href: "/reports",
      actionLabel: "View Reports",
    },
  ];

  const completedCount = items.filter((item) => item.completed).length;
  const progressPercent = (completedCount / items.length) * 100;

  if (completedCount === items.length) {
    return null;
  }

  return (
    <Card data-testid="card-onboarding-checklist">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Get Started</CardTitle>
            <CardDescription>
              Complete these steps to set up your job cost tracking
            </CardDescription>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {completedCount} of {items.length} completed
            </span>
            <span className="text-sm font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-3 rounded-md ${
              item.completed ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-muted/50"
            }`}
            data-testid={`checklist-item-${item.id}`}
          >
            <div className="mt-0.5">
              {item.completed ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`font-medium ${
                  item.completed ? "text-emerald-700 dark:text-emerald-400" : ""
                }`}
              >
                {item.title}
              </p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
            {!item.completed && (
              <Link href={item.href}>
                <Button size="sm" variant="outline" data-testid={`button-${item.id}`}>
                  {item.actionLabel}
                </Button>
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
