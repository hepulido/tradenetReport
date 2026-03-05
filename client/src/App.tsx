import { useState, useEffect } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { ThemeProvider } from "@/components/theme-provider";
import { CompanyProvider, useCompany } from "@/components/company-context";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { TopNav } from "@/components/top-nav";
import { BottomNav } from "@/components/bottom-nav";
import { CreateCompanyDialog } from "@/components/create-company-dialog";
import { TeamInviteDialog } from "@/components/team-invite-dialog";
import { OnboardingWizard, useNeedsOnboarding } from "@/components/onboarding-wizard";
import { Loader2 } from "lucide-react";
import Dashboard from "@/pages/dashboard";
import Estimates from "@/pages/estimates";
import DailyLogs from "@/pages/daily-logs";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import ProjectCRM from "@/pages/project-crm";
import Reports from "@/pages/reports";
import ReportDetail from "@/pages/report-detail";
import Upload from "@/pages/upload";
import Documents from "@/pages/documents";
import Labor from "@/pages/labor";
import Payroll from "@/pages/payroll";
import Settings from "@/pages/settings";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import NotFound from "@/pages/not-found";
import type { Company } from "@/lib/types";

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { needsOnboarding, loading: onboardingLoading } = useNeedsOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [location] = useLocation();

  if (loading || onboardingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  // Show onboarding wizard for new users without companies
  if (needsOnboarding && showOnboarding) {
    return <OnboardingWizard onComplete={() => {
      setShowOnboarding(false);
      window.location.reload(); // Refresh to get updated user data
    }} />;
  }

  return <>{children}</>;
}

// Public route wrapper (redirects to home if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { setCompanies, setSelectedCompany, setIsLoading } = useCompany();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTeamInvite, setShowTeamInvite] = useState(false);

  // Only fetch companies if user is logged in
  const { data: companiesData, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: !!user,
  });

  // When auth user loads, set companies from their profile
  useEffect(() => {
    if (user?.companies) {
      const userCompanies = user.companies.map((uc) => uc.company);
      setCompanies(userCompanies);
      if (userCompanies.length > 0) {
        setSelectedCompany(userCompanies[0]);
      }
      setIsLoading(false);
    }
  }, [user, setCompanies, setSelectedCompany, setIsLoading]);

  // Fallback to API companies (for backwards compatibility)
  useEffect(() => {
    if (companiesData && !user?.companies?.length) {
      setCompanies(companiesData);
      setIsLoading(false);
    }
  }, [companiesData, user, setCompanies, setIsLoading]);

  const createCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string; timezone: string }): Promise<Company> => {
      const res = await apiRequest("POST", "/api/companies", data);
      return res.json();
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
    <Switch>
      {/* Public routes */}
      <Route path="/login">
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      </Route>
      <Route path="/signup">
        <PublicRoute>
          <SignupPage />
        </PublicRoute>
      </Route>

      {/* Protected routes */}
      <Route>
        <ProtectedRoute>
          <div className="min-h-screen bg-background">
            <TopNav
                onCreateCompany={() => setShowCreateDialog(true)}
                onTeamInvite={() => setShowTeamInvite(true)}
              />
            <main>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/estimates" component={Estimates} />
                <Route path="/daily-logs" component={DailyLogs} />
                <Route path="/projects" component={Projects} />
                <Route path="/projects/:id/crm" component={ProjectCRM} />
                <Route path="/projects/:id" component={ProjectDetail} />
                <Route path="/reports" component={Reports} />
                <Route path="/reports/:id" component={ReportDetail} />
                <Route path="/upload" component={Upload} />
                <Route path="/documents" component={Documents} />
                <Route path="/labor" component={Labor} />
                <Route path="/payroll" component={Payroll} />
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
            <TeamInviteDialog
              open={showTeamInvite}
              onOpenChange={setShowTeamInvite}
            />
          </div>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="jobcost-ui-theme">
        <TooltipProvider>
          <AuthProvider>
            <CompanyProvider>
              <AppContent />
              <Toaster />
            </CompanyProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
