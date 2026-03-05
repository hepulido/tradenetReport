import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-context";
import { useCompany } from "@/components/company-context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Briefcase, CheckCircle, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
];

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user, getToken, refreshUser } = useAuth();
  const { setCompanies, setSelectedCompany } = useCompany();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const totalSteps = 3;

  // Company form state
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState(user?.email || "");
  const [timezone, setTimezone] = useState("America/New_York");

  // Project form state
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [skipProject, setSkipProject] = useState(false);

  // Create company mutation
  const createCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; timezone: string }) => {
      const token = await getToken();
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create company");
      return response.json();
    },
  });

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: { companyId: string; name: string; address?: string }) => {
      const token = await getToken();
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyId: data.companyId,
          name: data.name,
          address: data.address,
          status: "active",
        }),
      });
      if (!response.ok) throw new Error("Failed to create project");
      return response.json();
    },
  });

  const handleNext = async () => {
    if (step === 1) {
      // Validate company info
      if (!companyName.trim()) {
        toast({ title: "Error", description: "Company name is required", variant: "destructive" });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      // Create company
      try {
        const company = await createCompanyMutation.mutateAsync({
          name: companyName.trim(),
          email: companyEmail.trim(),
          timezone,
        });

        // Refresh user to get updated companies list
        await refreshUser();

        setCompanies([company]);
        setSelectedCompany(company);

        if (skipProject) {
          // Complete without creating a project
          queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
          onComplete();
        } else {
          setStep(3);
        }
      } catch (error) {
        toast({ title: "Error", description: "Failed to create company", variant: "destructive" });
      }
    } else if (step === 3) {
      // Create project (optional)
      if (projectName.trim()) {
        try {
          const company = createCompanyMutation.data;
          await createProjectMutation.mutateAsync({
            companyId: company.id,
            name: projectName.trim(),
            address: projectAddress.trim() || undefined,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          // Refresh user before completing
          await refreshUser();
          onComplete();
        } catch (error) {
          toast({ title: "Error", description: "Failed to create project", variant: "destructive" });
        }
      } else {
        // Skip project creation - still refresh user
        await refreshUser();
        onComplete();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSkipProject = () => {
    setSkipProject(true);
    handleNext();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            {step === 1 && <Building2 className="h-8 w-8 text-primary" />}
            {step === 2 && <Briefcase className="h-8 w-8 text-primary" />}
            {step === 3 && <CheckCircle className="h-8 w-8 text-primary" />}
          </div>
          <CardTitle className="text-2xl">
            {step === 1 && "Welcome to JobCost AI"}
            {step === 2 && "Set Up Your Company"}
            {step === 3 && "Create Your First Project"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Let's get your company set up in just a few steps"}
            {step === 2 && "Tell us about your company"}
            {step === 3 && "Add your first construction project (optional)"}
          </CardDescription>
          <Progress value={(step / totalSteps) * 100} className="mt-4" />
          <p className="text-sm text-muted-foreground mt-2">Step {step} of {totalSteps}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  placeholder="Trebol Contractors Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyEmail">Company Email</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  placeholder="info@company.com"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-medium mb-2">Company Details</h3>
                <p className="text-sm text-muted-foreground">Name: {companyName}</p>
                <p className="text-sm text-muted-foreground">Email: {companyEmail || "Not provided"}</p>
                <p className="text-sm text-muted-foreground">
                  Timezone: {TIMEZONES.find((t) => t.value === timezone)?.label}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Click "Create Company" to set up your company and continue to project setup.
              </p>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  placeholder="Downtown Office Renovation"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectAddress">Project Address</Label>
                <Input
                  id="projectAddress"
                  placeholder="123 Main St, Miami, FL"
                  value={projectAddress}
                  onChange={(e) => setProjectAddress(e.target.value)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                You can always add more projects later from the Projects page.
              </p>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          {step > 1 && step !== 2 && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          {step === 1 && <div />}
          {step === 2 && <div />}

          <div className="flex gap-2">
            {step === 3 && (
              <Button variant="ghost" onClick={() => onComplete()}>
                Skip for now
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={createCompanyMutation.isPending || createProjectMutation.isPending}
            >
              {(createCompanyMutation.isPending || createProjectMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {step === 1 && "Next"}
              {step === 2 && "Create Company"}
              {step === 3 && (projectName.trim() ? "Create Project" : "Finish")}
              {step !== 3 && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

// Hook to check if user needs onboarding
export function useNeedsOnboarding() {
  const { user, loading } = useAuth();

  if (loading) return { needsOnboarding: false, loading: true };
  if (!user) return { needsOnboarding: false, loading: false };

  // User needs onboarding if they have no companies
  const needsOnboarding = !user.companies || user.companies.length === 0;

  return { needsOnboarding, loading: false };
}
