import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { ThemeProvider } from "@/components/theme-provider";
import { CompanyProvider, useCompany } from "@/components/company-context";
import { TopNav } from "@/components/top-nav";
import { BottomNav } from "@/components/bottom-nav";
import { CreateCompanyDialog } from "@/components/create-company-dialog";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Reports from "@/pages/reports";
import ReportDetail from "@/pages/report-detail";
import Upload from "@/pages/upload";
import Documents from "@/pages/documents";
import Labor from "@/pages/labor";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import type { Company } from "@/lib/types";

function AppContent() {
  const { toast } = useToast();
  const { setCompanies, setSelectedCompany, setIsLoading, companies } = useCompany();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: companiesData, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  useEffect(() => {
    if (companiesData) {
      setCompanies(companiesData);
      setIsLoading(false);
    }
  }, [companiesData, setCompanies, setIsLoading]);

  const createCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string; timezone: string }) => {
      return await apiRequest("POST", "/api/companies", data);
    },
    onSuccess: (newCompany: Company) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setSelectedCompany(newCompany);
      setShowCreateDialog(false);
      toast({
        title: "Company Created",
        description: "Your company has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create company. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <TopNav onCreateCompany={() => setShowCreateDialog(true)} />
      <main>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/projects" component={Projects} />
          <Route path="/projects/:id" component={ProjectDetail} />
          <Route path="/reports" component={Reports} />
          <Route path="/reports/:id" component={ReportDetail} />
          <Route path="/upload" component={Upload} />
          <Route path="/documents" component={Documents} />
          <Route path="/labor" component={Labor} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <BottomNav />
      <CreateCompanyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={async (data) => {
          await createCompanyMutation.mutateAsync(data);
        }}
        isSubmitting={createCompanyMutation.isPending}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="jobcost-ui-theme">
        <TooltipProvider>
          <CompanyProvider>
            <AppContent />
            <Toaster />
          </CompanyProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
