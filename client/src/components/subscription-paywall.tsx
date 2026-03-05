import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "@/components/company-context";
import { useAuth } from "@/components/auth-context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Loader2, Crown, Rocket, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLANS = {
  starter: {
    name: "Starter",
    price: "$29",
    period: "/month",
    icon: Rocket,
    features: ["5 projects", "Basic reports", "Email support"],
    recommended: false,
  },
  pro: {
    name: "Pro",
    price: "$79",
    period: "/month",
    icon: Crown,
    features: ["Unlimited projects", "AI document parsing", "Priority support", "Team members"],
    recommended: true,
  },
  enterprise: {
    name: "Enterprise",
    price: "$199",
    period: "/month",
    icon: Building2,
    features: ["Everything in Pro", "Custom integrations", "Dedicated support", "SLA"],
    recommended: false,
  },
};

type PlanKey = keyof typeof PLANS;

interface SubscriptionStatusData {
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  trialEndsAt: string | null;
}

export function SubscriptionPaywall({
  children,
  feature,
}: {
  children: React.ReactNode;
  feature?: string;
}) {
  const { currentCompany } = useCompany();
  const { getToken } = useAuth();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const { data: subscription, isLoading } = useQuery<SubscriptionStatusData>({
    queryKey: ["/api/companies", currentCompany?.id, "subscription"],
    queryFn: async () => {
      if (!currentCompany) return { subscriptionStatus: null, subscriptionPlan: null, trialEndsAt: null };
      const token = await getToken();
      const response = await fetch(`/api/companies/${currentCompany.id}/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch subscription");
      return response.json();
    },
    enabled: !!currentCompany,
  });

  const isActive = subscription?.subscriptionStatus === "active" ||
                   subscription?.subscriptionStatus === "trialing";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // If subscription is active, show children
  if (isActive) {
    return <>{children}</>;
  }

  // Otherwise, show paywall
  return (
    <>
      <Card className="max-w-lg mx-auto mt-8">
        <CardHeader className="text-center">
          <Crown className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
          <CardTitle>Upgrade Required</CardTitle>
          <CardDescription>
            {feature
              ? `The ${feature} feature requires an active subscription.`
              : "An active subscription is required to access this feature."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Start your free trial today and unlock all features for 14 days.
          </p>
          <Button onClick={() => setShowUpgradeDialog(true)} size="lg">
            View Plans & Pricing
          </Button>
        </CardContent>
      </Card>

      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
      />
    </>
  );
}

export function UpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentCompany } = useCompany();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);

  const checkoutMutation = useMutation({
    mutationFn: async (plan: PlanKey) => {
      const token = await getToken();
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyId: currentCompany?.id,
          plan,
          successUrl: `${window.location.origin}/settings?tab=billing&success=true`,
          cancelUrl: `${window.location.origin}/settings?tab=billing`,
        }),
      });
      if (!response.ok) throw new Error("Failed to create checkout session");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
      setLoadingPlan(null);
    },
  });

  const handleSelectPlan = (plan: PlanKey) => {
    setLoadingPlan(plan);
    checkoutMutation.mutate(plan);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">Choose Your Plan</DialogTitle>
          <DialogDescription className="text-center">
            Start with a 14-day free trial. Cancel anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {(Object.entries(PLANS) as [PlanKey, typeof PLANS[PlanKey]][]).map(([key, plan]) => (
            <Card
              key={key}
              className={`relative ${plan.recommended ? "border-primary shadow-lg" : ""}`}
            >
              {plan.recommended && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <CardHeader className="text-center pb-2">
                <plan.icon className={`h-10 w-10 mx-auto mb-2 ${plan.recommended ? "text-primary" : "text-muted-foreground"}`} />
                <CardTitle>{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.recommended ? "default" : "outline"}
                  onClick={() => handleSelectPlan(key)}
                  disabled={loadingPlan !== null}
                >
                  {loadingPlan === key ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Start Free Trial
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          By starting a trial, you agree to our Terms of Service and Privacy Policy.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// Hook to check subscription status
export function useSubscription() {
  const { currentCompany } = useCompany();
  const { getToken } = useAuth();

  const { data: subscription, isLoading } = useQuery<SubscriptionStatusData>({
    queryKey: ["/api/companies", currentCompany?.id, "subscription"],
    queryFn: async () => {
      if (!currentCompany) return { subscriptionStatus: null, subscriptionPlan: null, trialEndsAt: null };
      const token = await getToken();
      const response = await fetch(`/api/companies/${currentCompany.id}/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch subscription");
      return response.json();
    },
    enabled: !!currentCompany,
  });

  const isActive = subscription?.subscriptionStatus === "active" ||
                   subscription?.subscriptionStatus === "trialing";

  const trialDaysRemaining = (() => {
    if (!subscription?.trialEndsAt) return 0;
    const trialEnd = new Date(subscription.trialEndsAt);
    const now = new Date();
    const diff = trialEnd.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  return {
    isLoading,
    isActive,
    subscription,
    trialDaysRemaining,
    plan: subscription?.subscriptionPlan || null,
  };
}
