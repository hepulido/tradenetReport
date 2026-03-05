import Stripe from "stripe";
import { storage } from "./storage";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// Pricing plans
export const PLANS = {
  starter: {
    name: "Starter",
    priceId: process.env.STRIPE_STARTER_PRICE_ID || "",
    features: ["5 projects", "Basic reports", "Email support"],
    limits: { projects: 5 },
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRO_PRICE_ID || "",
    features: ["Unlimited projects", "AI document parsing", "Priority support", "Team members"],
    limits: { projects: -1 },
  },
  enterprise: {
    name: "Enterprise",
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
    features: ["Everything in Pro", "Custom integrations", "Dedicated support", "SLA"],
    limits: { projects: -1 },
  },
};

export async function createCheckoutSession(companyId: string, plan: keyof typeof PLANS, successUrl: string, cancelUrl: string) {
  const company = await storage.getCompany(companyId);
  if (!company) {
    throw new Error("Company not found");
  }

  const planConfig = PLANS[plan];
  if (!planConfig.priceId) {
    throw new Error("Price ID not configured for this plan");
  }

  // Create or get customer
  let customerId = company.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: company.email || undefined,
      name: company.name,
      metadata: { companyId },
    });
    customerId = customer.id;
    await storage.updateCompanySubscription(companyId, { stripeCustomerId: customerId });
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: planConfig.priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { companyId, plan },
    subscription_data: {
      metadata: { companyId, plan },
    },
  });

  return session;
}

export async function createBillingPortalSession(companyId: string, returnUrl: string) {
  const company = await storage.getCompany(companyId);
  if (!company?.stripeCustomerId) {
    throw new Error("No Stripe customer found for this company");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: returnUrl,
  });

  return session;
}

export async function handleWebhook(payload: string, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret not configured");
  }

  const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.metadata?.companyId;
      const plan = session.metadata?.plan as keyof typeof PLANS;

      if (companyId && plan) {
        await storage.updateCompanySubscription(companyId, {
          stripeSubscriptionId: session.subscription as string,
          subscriptionStatus: "active",
          subscriptionPlan: plan,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const companyId = subscription.metadata?.companyId;

      if (companyId) {
        await storage.updateCompanySubscription(companyId, {
          subscriptionStatus: subscription.status,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const companyId = subscription.metadata?.companyId;

      if (companyId) {
        await storage.updateCompanySubscription(companyId, {
          subscriptionStatus: "canceled",
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const companyId = subscription.metadata?.companyId;

        if (companyId) {
          await storage.updateCompanySubscription(companyId, {
            subscriptionStatus: "past_due",
          });
        }
      }
      break;
    }
  }

  return { received: true };
}

export function isSubscriptionActive(status: string | null): boolean {
  return status === "active" || status === "trialing";
}

export function getTrialDaysRemaining(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  const diff = trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
