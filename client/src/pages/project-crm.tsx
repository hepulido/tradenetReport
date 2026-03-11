import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Pencil,
  Check,
  X,
  Plus,
  FileText,
  Receipt,
  Users,
  Package,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Upload,
  FileUp,
  Image,
  Wallet,
  ClipboardList,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ExportButton } from "@/components/export-button";
import { EXPORT_COLUMNS } from "@/lib/export";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

import type {
  ProjectWithDetails,
  GeneralContractor,
  ChangeOrder,
  ProjectInvoice,
  PaymentReceived,
  PayrollEntry,
  Worker,
  ProjectBudget,
  BudgetLineItem,
} from "@/lib/types";

import { ContractEditDialog } from "@/components/contract-edit-dialog";
import { TakeoffItemDialog } from "@/components/takeoff-item-dialog";
import { TakeoffUploadDialog } from "@/components/takeoff-upload-dialog";
import { UniversalFileUpload } from "@/components/universal-file-upload";
import { ManualInvoiceDialog } from "@/components/manual-invoice-dialog";
import { ChangeOrderDialog } from "@/components/change-order-dialog";
import { CreateInvoiceDialog } from "@/components/create-invoice-dialog";
import { CheckUploadDialog } from "@/components/check-upload-dialog";

// ========== Utility Functions ==========

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatCurrencyCompact = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return formatCurrency(value);
};

const formatPercent = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "0%";
  return `${num.toFixed(1)}%`;
};

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "active":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "completed":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "on_hold":
    case "paused":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "approved":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "pending":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "rejected":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    case "invoiced":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "paid":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "partial":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "sent":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "draft":
      return "bg-slate-500/10 text-slate-600 border-slate-500/20";
    default:
      return "bg-slate-500/10 text-slate-600 border-slate-500/20";
  }
};

// ========== Sub Components ==========

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  trend,
  variant = "default",
}: {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ElementType;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantStyles = {
    default: "bg-card",
    success: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
    warning: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
    danger: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
  };

  const iconStyles = {
    default: "text-muted-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className={cn("rounded-xl border p-4 transition-all", variantStyles[variant])}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", iconStyles[variant])} />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {trend && (
          <span className={cn(
            "text-xs font-medium",
            trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-muted-foreground"
          )}>
            {trend === "up" && <TrendingUp className="inline h-3 w-3" />}
            {trend === "down" && <TrendingDown className="inline h-3 w-3" />}
          </span>
        )}
      </div>
      {subValue && <p className="mt-1 text-xs text-muted-foreground">{subValue}</p>}
    </div>
  );
}

function ProgressRing({ value, size = 120, strokeWidth = 10 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-muted/20"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="text-primary transition-all duration-500 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{value}%</span>
        <span className="text-xs text-muted-foreground">Complete</span>
      </div>
    </div>
  );
}

function EditablePercent({
  value,
  onSave,
  isLoading,
}: {
  value: number;
  onSave: (newValue: number) => void;
  isLoading?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  const handleSave = () => {
    const num = parseFloat(editValue);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      onSave(num);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0"
          max="100"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="w-20 h-8 text-center"
          autoFocus
        />
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSave} disabled={isLoading}>
          <Check className="h-4 w-4 text-emerald-600" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsEditing(false)}>
          <X className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="group flex items-center gap-1 hover:bg-muted/50 rounded px-2 py-1 -mx-2 transition-colors"
    >
      <span className="text-2xl font-bold">{value}%</span>
      <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ========== Tab Content Components ==========

function OverviewTab({
  project,
  changeOrders,
  invoices,
  payments,
  laborCost,
  materialCost,
  onUpdatePercent,
  isUpdating,
  projectId,
}: {
  project: ProjectWithDetails;
  changeOrders: ChangeOrder[];
  invoices: ProjectInvoice[];
  payments: PaymentReceived[];
  laborCost: number;
  materialCost: number;
  onUpdatePercent: (value: number) => void;
  isUpdating: boolean;
  projectId: string;
}) {
  const [showMaterialsSheet, setShowMaterialsSheet] = useState(false);
  const [showLaborSheet, setShowLaborSheet] = useState(false);

  // Fetch materials breakdown when sheet opens
  const { data: materialsBreakdown, isLoading: materialsLoading } = useQuery<{
    ok: boolean;
    breakdown: Array<{
      category: string;
      amount: number;
      itemCount: number;
      invoiceCount: number;
      items: any[];
    }>;
    totalMaterials: number;
    categoryCount: number;
  }>({
    queryKey: [`/api/projects/${projectId}/materials/breakdown`],
    enabled: showMaterialsSheet,
  });

  // Fetch labor breakdown when sheet opens
  const { data: laborBreakdown, isLoading: laborLoading } = useQuery<{
    ok: boolean;
    breakdown: Array<{
      role: string;
      amount: number;
      hours: number;
      workerCount: number;
      workers: any[];
    }>;
    totalLabor: number;
    totalHours: number;
    roleCount: number;
  }>({
    queryKey: [`/api/projects/${projectId}/labor/breakdown`],
    enabled: showLaborSheet,
  });

  // Fetch budget line items for comparison (materials budgets) - always fetch for overview display
  const { data: budgetsData } = useQuery<{ ok: boolean; budgets: ProjectBudget[] }>({
    queryKey: [`/api/projects/${projectId}/budgets`],
    enabled: !!projectId,
  });
  const activeBudget = budgetsData?.budgets?.find(b => b.status === "active") || budgetsData?.budgets?.[0];
  const budgetedAmount = activeBudget ? parseFloat(activeBudget.estimatedCost || "0") : 0;

  // Fetch budget line items for active budget
  const { data: budgetLineItemsData } = useQuery<{ ok: boolean; budget: ProjectBudget; lineItems: BudgetLineItem[] }>({
    queryKey: [`/api/budgets/${activeBudget?.id}`],
    enabled: !!activeBudget?.id && showMaterialsSheet,
  });
  const budgetLineItems = budgetLineItemsData?.lineItems || [];

  const initialProposal = parseFloat(project.initialProposal || "0");
  const totalCOs = changeOrders
    .filter(co => co.status === "approved" || co.status === "invoiced")
    .reduce((sum, co) => sum + parseFloat(co.amount), 0);
  const finalContract = initialProposal + totalCOs;
  const percentComplete = parseFloat(project.percentComplete || "0");

  const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const outstandingAR = totalInvoiced - totalPaid;

  const totalCosts = materialCost + laborCost;
  const grossProfit = totalPaid - totalCosts;
  const grossMargin = totalPaid > 0 ? (grossProfit / totalPaid) * 100 : 0;

  const projectedCost = percentComplete > 0 ? (totalCosts / percentComplete) * 100 : totalCosts;
  const projectedProfit = finalContract - projectedCost;
  const projectedMargin = finalContract > 0 ? (projectedProfit / finalContract) * 100 : 0;

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      metal_studs: "Metal Studs",
      drywall: "Drywall",
      ceiling_grid: "Ceiling Grid",
      ceiling_tile: "Ceiling Tile",
      metal_angles: "Metal/Angles",
      insulation: "Insulation",
      fasteners: "Fasteners",
      tape_compound: "Tape & Compound",
      tape_mud: "Tape & Mud",
      corner_bead: "Corner Bead",
      framing: "Framing",
      accessories: "Accessories",
      misc: "Misc",
    };
    return labels[category] || category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      framer: "Framer",
      finisher: "Finisher",
      drywall: "Drywall Installer",
      hanger: "Hanger",
      taper: "Taper",
      laborer: "Laborer",
      foreman: "Foreman",
      helper: "Helper",
      apprentice: "Apprentice",
    };
    return labels[role] || role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <ProgressRing value={percentComplete} />
            <div className="flex-1 space-y-4 w-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Progress</p>
                  <EditablePercent
                    value={percentComplete}
                    onSave={onUpdatePercent}
                    isLoading={isUpdating}
                  />
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Contract Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(finalContract)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Initial Contract</span>
                  <span>{formatCurrency(initialProposal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Change Orders ({changeOrders.filter(co => co.status === "approved" || co.status === "invoiced").length})</span>
                  <span className={totalCOs >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {totalCOs >= 0 ? "+" : ""}{formatCurrency(totalCOs)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Invoiced"
          value={formatCurrencyCompact(totalInvoiced)}
          icon={FileText}
        />
        <StatCard
          label="Received"
          value={formatCurrencyCompact(totalPaid)}
          icon={DollarSign}
          variant="success"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrencyCompact(outstandingAR)}
          icon={Clock}
          variant={outstandingAR > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Margin"
          value={formatPercent(grossMargin)}
          icon={Percent}
          variant={grossMargin >= 20 ? "success" : grossMargin >= 10 ? "warning" : "danger"}
        />
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Cost Breakdown</CardTitle>
            {budgetedAmount > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Estimated (Takeoff)</p>
                <p className="text-sm font-semibold text-blue-600">{formatCurrency(budgetedAmount)}</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <button
              onClick={() => setShowMaterialsSheet(true)}
              className="w-full flex items-center justify-between p-2 -m-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Materials</p>
                  <p className="text-sm text-muted-foreground">Vendor invoices</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">{formatCurrency(materialCost)}</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
            <Separator />
            <button
              onClick={() => setShowLaborSheet(true)}
              className="w-full flex items-center justify-between p-2 -m-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Labor</p>
                  <p className="text-sm text-muted-foreground">Weekly payroll</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">{formatCurrency(laborCost)}</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
            <Separator />
            <div className="flex items-center justify-between pt-2">
              <p className="font-semibold">Total Costs</p>
              <p className="text-xl font-bold">{formatCurrency(totalCosts)}</p>
            </div>
            {budgetedAmount > 0 && (
              <div className="pt-3 mt-3 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Budget vs Actual</span>
                  <span className={totalCosts <= budgetedAmount ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                    {totalCosts <= budgetedAmount
                      ? `${formatCurrency(budgetedAmount - totalCosts)} under budget`
                      : `${formatCurrency(totalCosts - budgetedAmount)} over budget`
                    }
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Materials Breakdown Dialog */}
      <Dialog open={showMaterialsSheet} onOpenChange={setShowMaterialsSheet}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              Materials Breakdown
            </DialogTitle>
            <DialogDescription>
              Budget vs actual spending by category
            </DialogDescription>
          </DialogHeader>

          {materialsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : materialsBreakdown ? (() => {
            // Calculate budget by category from takeoff line items
            const budgetByCategory: Record<string, number> = {};
            for (const item of budgetLineItems) {
              const cat = item.category || "misc";
              budgetByCategory[cat] = (budgetByCategory[cat] || 0) + parseFloat(item.totalCost || "0");
            }

            // Merge with spent data
            const allCategories = new Set([
              ...Object.keys(budgetByCategory),
              ...materialsBreakdown.breakdown.map(b => b.category),
            ]);

            const categoryData = Array.from(allCategories).map(category => {
              const spentData = materialsBreakdown.breakdown.find(b => b.category === category);
              const budgeted = budgetByCategory[category] || 0;
              const spent = spentData?.amount || 0;
              return {
                category,
                budgeted,
                spent,
                remaining: budgeted - spent,
                invoiceCount: spentData?.invoiceCount || 0,
                itemCount: spentData?.itemCount || 0,
              };
            }).sort((a, b) => (b.spent + b.budgeted) - (a.spent + a.budgeted));

            const totalBudgeted = Object.values(budgetByCategory).reduce((sum, v) => sum + v, 0);
            const totalSpent = materialsBreakdown.totalMaterials;
            const totalRemaining = totalBudgeted - totalSpent;

            return (
              <div className="space-y-6">
                {/* Totals Summary */}
                <div className="grid grid-cols-3 gap-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Budgeted</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalBudgeted)}</p>
                    <p className="text-xs text-muted-foreground">from takeoff</p>
                  </div>
                  <div className="text-center border-x">
                    <p className="text-sm text-muted-foreground mb-1">Spent</p>
                    <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalSpent)}</p>
                    <p className="text-xs text-muted-foreground">{materialsBreakdown.categoryCount} categories</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Remaining</p>
                    <p className={cn(
                      "text-2xl font-bold",
                      totalRemaining >= 0 ? "text-emerald-600" : "text-red-600"
                    )}>
                      {formatCurrency(totalRemaining)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalBudgeted > 0 ? `${((totalSpent / totalBudgeted) * 100).toFixed(0)}% used` : "no budget"}
                    </p>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div>
                  <h4 className="font-semibold mb-4 text-lg">By Category</h4>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {categoryData.length === 0 ? (
                      <div className="text-center py-8 bg-muted/30 rounded-lg">
                        <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-muted-foreground">No material categories found</p>
                        <p className="text-sm text-muted-foreground">Add takeoff items or upload invoices</p>
                      </div>
                    ) : (
                      categoryData.map((cat) => {
                        const budgetUsedPercent = cat.budgeted > 0
                          ? Math.min((cat.spent / cat.budgeted) * 100, 100)
                          : cat.spent > 0 ? 100 : 0;
                        const isOverBudget = cat.remaining < 0;

                        return (
                          <div key={cat.category} className="p-4 border rounded-xl bg-card hover:shadow-sm transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-medium">{getCategoryLabel(cat.category)}</Badge>
                                {cat.invoiceCount > 0 && (
                                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    {cat.invoiceCount} invoice{cat.invoiceCount > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                              {isOverBudget && (
                                <Badge variant="destructive" className="text-xs">Over Budget</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                              <div className="bg-muted/50 rounded-lg p-2 text-center">
                                <span className="text-xs text-muted-foreground block">Budget</span>
                                <span className="font-semibold">{formatCurrency(cat.budgeted)}</span>
                              </div>
                              <div className="bg-muted/50 rounded-lg p-2 text-center">
                                <span className="text-xs text-muted-foreground block">Spent</span>
                                <span className="font-semibold">{formatCurrency(cat.spent)}</span>
                              </div>
                              <div className={cn(
                                "rounded-lg p-2 text-center",
                                isOverBudget ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30"
                              )}>
                                <span className="text-xs text-muted-foreground block">Remaining</span>
                                <span className={cn("font-semibold", isOverBudget ? "text-red-600" : "text-emerald-600")}>
                                  {formatCurrency(cat.remaining)}
                                </span>
                              </div>
                            </div>
                            {(cat.budgeted > 0 || cat.spent > 0) && (
                              <Progress
                                value={budgetUsedPercent}
                                className={cn("h-2", isOverBudget && "[&>div]:bg-red-500")}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="text-center py-8">
              <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">No data available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Labor Breakdown Dialog */}
      <Dialog open={showLaborSheet} onOpenChange={setShowLaborSheet}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              Labor Breakdown
            </DialogTitle>
            <DialogDescription>
              Hours and costs by worker role
            </DialogDescription>
          </DialogHeader>

          {laborLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : laborBreakdown ? (() => {
            const totalWorkers = laborBreakdown.breakdown.reduce((sum, r) => sum + r.workerCount, 0);

            return (
              <div className="space-y-6">
                {/* Totals Summary */}
                <div className="grid grid-cols-3 gap-4 p-5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-xl border">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Total Hours</p>
                    <p className="text-2xl font-bold">{laborBreakdown.totalHours.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">estimated</p>
                  </div>
                  <div className="text-center border-x">
                    <p className="text-sm text-muted-foreground mb-1">Total Cost</p>
                    <p className="text-2xl font-bold text-purple-600">{formatCurrency(laborBreakdown.totalLabor)}</p>
                    <p className="text-xs text-muted-foreground">all payroll</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Workers</p>
                    <p className="text-2xl font-bold">{totalWorkers}</p>
                    <p className="text-xs text-muted-foreground">{laborBreakdown.roleCount} roles</p>
                  </div>
                </div>

                {/* Role Breakdown */}
                <div>
                  <h4 className="font-semibold mb-4 text-lg">By Role</h4>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {laborBreakdown.breakdown.length === 0 ? (
                      <div className="text-center py-8 bg-muted/30 rounded-lg">
                        <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-muted-foreground">No labor entries found</p>
                        <p className="text-sm text-muted-foreground">Add payroll entries in the Payroll tab</p>
                      </div>
                    ) : (
                      laborBreakdown.breakdown.map((role) => {
                        const avgRate = role.hours > 0 ? role.amount / role.hours : 0;
                        const percentOfTotal = laborBreakdown.totalLabor > 0
                          ? (role.amount / laborBreakdown.totalLabor) * 100
                          : 0;

                        return (
                          <div key={role.role} className="p-4 border rounded-xl bg-card hover:shadow-sm transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-medium px-3 py-1">
                                {getRoleLabel(role.role)}
                              </Badge>
                              <div className="text-right">
                                <span className="text-xl font-bold">{formatCurrency(role.amount)}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({percentOfTotal.toFixed(0)}%)
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                              <div className="bg-muted/50 rounded-lg p-2 text-center">
                                <span className="text-xs text-muted-foreground block">Hours</span>
                                <span className="font-semibold">{role.hours.toFixed(1)}</span>
                              </div>
                              <div className="bg-muted/50 rounded-lg p-2 text-center">
                                <span className="text-xs text-muted-foreground block">Workers</span>
                                <span className="font-semibold">{role.workerCount}</span>
                              </div>
                              <div className="bg-muted/50 rounded-lg p-2 text-center">
                                <span className="text-xs text-muted-foreground block">Avg Rate</span>
                                <span className="font-semibold">{role.hours > 0 ? `${formatCurrency(avgRate)}/hr` : "N/A"}</span>
                              </div>
                            </div>
                            {/* Progress bar showing percentage of total */}
                            <Progress value={percentOfTotal} className="h-2 mb-2" />
                            {/* Worker names */}
                            {role.workers && role.workers.length > 0 && (
                              <div className="pt-2 border-t mt-2">
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Workers:</span>{" "}
                                  {role.workers.map((w: any) => w.name).join(", ")}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="text-center py-8">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">No data available</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Projected Profit */}
      <Card className={cn(
        "border-2",
        projectedMargin >= 20 ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20" :
        projectedMargin >= 10 ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20" :
        "border-red-500/30 bg-red-50/50 dark:bg-red-950/20"
      )}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Projected Profit</p>
              <p className="text-3xl font-bold">{formatCurrency(projectedProfit)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {formatPercent(projectedMargin)} margin at completion
              </p>
            </div>
            <div className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center",
              projectedMargin >= 20 ? "bg-emerald-500/20" :
              projectedMargin >= 10 ? "bg-amber-500/20" :
              "bg-red-500/20"
            )}>
              {projectedMargin >= 20 ? (
                <TrendingUp className="h-8 w-8 text-emerald-600" />
              ) : projectedMargin >= 10 ? (
                <TrendingUp className="h-8 w-8 text-amber-600" />
              ) : (
                <TrendingDown className="h-8 w-8 text-red-600" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BillingTab({
  invoices,
  payments,
  project,
  projectId,
  changeOrders,
}: {
  invoices: ProjectInvoice[];
  payments: PaymentReceived[];
  project: ProjectWithDetails;
  projectId: string;
  changeOrders: ChangeOrder[];
}) {
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCheckUpload, setShowCheckUpload] = useState(false);
  const [showChangeOrderDialog, setShowChangeOrderDialog] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [selectedInvoice, setSelectedInvoice] = useState<ProjectInvoice | null>(null);
  const [selectedChangeOrder, setSelectedChangeOrder] = useState<ChangeOrder | null>(null);

  // Edit mode states
  const [isEditingInvoice, setIsEditingInvoice] = useState(false);
  const [isEditingCO, setIsEditingCO] = useState(false);

  // Invoice edit form state
  const [editInvoiceForm, setEditInvoiceForm] = useState({
    invoiceNumber: "",
    amount: "",
    invoiceDate: "",
    dueDate: "",
    poNumber: "",
    status: "",
    notes: "",
    billingType: "",
    percentBilled: "",
  });

  // Change Order edit form state
  const [editCOForm, setEditCOForm] = useState({
    coNumber: "",
    description: "",
    amount: "",
    poNumber: "",
    dateSubmitted: "",
    dateApproved: "",
    status: "",
    notes: "",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Update Invoice mutation
  const updateInvoiceMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Record<string, any> }) => {
      const res = await fetch(`/api/project-invoices/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.updates),
      });
      if (!res.ok) throw new Error("Failed to update invoice");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/project-invoices`] });
      setIsEditingInvoice(false);
      setSelectedInvoice(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Update Change Order mutation
  const updateCOMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Record<string, any> }) => {
      const res = await fetch(`/api/change-orders/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.updates),
      });
      if (!res.ok) throw new Error("Failed to update change order");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Change order updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/change-orders`] });
      setIsEditingCO(false);
      setSelectedChangeOrder(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Initialize edit forms when selecting items
  const startEditingInvoice = () => {
    if (selectedInvoice) {
      setEditInvoiceForm({
        invoiceNumber: selectedInvoice.invoiceNumber || "",
        amount: selectedInvoice.amount || "",
        invoiceDate: selectedInvoice.invoiceDate || "",
        dueDate: selectedInvoice.dueDate || "",
        poNumber: selectedInvoice.poNumber || "",
        status: selectedInvoice.status || "draft",
        notes: selectedInvoice.notes || "",
        billingType: selectedInvoice.billingType || "progress",
        percentBilled: selectedInvoice.percentBilled || "",
      });
      setIsEditingInvoice(true);
    }
  };

  const startEditingCO = () => {
    if (selectedChangeOrder) {
      setEditCOForm({
        coNumber: selectedChangeOrder.coNumber || "",
        description: selectedChangeOrder.description || "",
        amount: selectedChangeOrder.amount || "",
        poNumber: selectedChangeOrder.poNumber || "",
        dateSubmitted: selectedChangeOrder.dateSubmitted || "",
        dateApproved: selectedChangeOrder.dateApproved || "",
        status: selectedChangeOrder.status || "pending",
        notes: selectedChangeOrder.notes || "",
      });
      setIsEditingCO(true);
    }
  };

  const saveInvoiceChanges = () => {
    if (!selectedInvoice) return;
    updateInvoiceMutation.mutate({
      id: selectedInvoice.id,
      updates: {
        invoiceNumber: editInvoiceForm.invoiceNumber,
        amount: editInvoiceForm.amount,
        invoiceDate: editInvoiceForm.invoiceDate,
        dueDate: editInvoiceForm.dueDate || null,
        poNumber: editInvoiceForm.poNumber || null,
        status: editInvoiceForm.status,
        notes: editInvoiceForm.notes || null,
        billingType: editInvoiceForm.billingType,
        percentBilled: editInvoiceForm.percentBilled || null,
      },
    });
  };

  const saveCOChanges = () => {
    if (!selectedChangeOrder) return;
    updateCOMutation.mutate({
      id: selectedChangeOrder.id,
      updates: {
        coNumber: editCOForm.coNumber,
        description: editCOForm.description || null,
        amount: editCOForm.amount,
        poNumber: editCOForm.poNumber || null,
        dateSubmitted: editCOForm.dateSubmitted || null,
        dateApproved: editCOForm.dateApproved || null,
        status: editCOForm.status,
        notes: editCOForm.notes || null,
      },
    });
  };

  const getInvoicePayments = (invoiceId: string) => {
    return payments.filter(p => p.projectInvoiceId === invoiceId);
  };

  const getInvoicePaidAmount = (invoiceId: string) => {
    return getInvoicePayments(invoiceId).reduce((sum, p) => sum + parseFloat(p.amount), 0);
  };

  // Unlinked payments (not tied to a specific invoice)
  const unlinkedPayments = payments.filter(p => !p.projectInvoiceId);

  const totalBilled = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const initialContract = parseFloat(project.initialProposal || "0");
  const totalCOs = changeOrders.reduce((sum, co) => sum + parseFloat(co.amount), 0);
  const adjustedContract = initialContract + totalCOs;
  const pendingCOs = changeOrders.filter(co => co.status === "pending");

  // Calculate billing percentages based on progress billing invoices only
  const progressBilledPercent = initialContract > 0
    ? invoices
        .filter(inv => inv.billingType === "progress")
        .reduce((sum, inv) => sum + parseFloat(inv.percentBilled || "0"), 0)
    : 0;
  const remainingPercent = Math.max(0, 100 - progressBilledPercent);

  const getBillingTypeBadge = (billingType: string | null) => {
    switch (billingType) {
      case "progress":
        return { label: "Progress", color: "bg-blue-500/10 text-blue-600" };
      case "labor":
        return { label: "Labor", color: "bg-purple-500/10 text-purple-600" };
      case "change_order":
        return { label: "CO", color: "bg-amber-500/10 text-amber-600" };
      case "final":
        return { label: "Final", color: "bg-emerald-500/10 text-emerald-600" };
      case "retainage":
        return { label: "Retainage", color: "bg-slate-500/10 text-slate-600" };
      default:
        return null;
    }
  };

  const getInvoiceStatus = (invoice: ProjectInvoice) => {
    const amount = parseFloat(invoice.amount);
    const paid = getInvoicePaidAmount(invoice.id);
    if (paid >= amount) return "paid";
    if (paid > 0) return "partial";
    if (invoice.status === "sent") return "sent";
    return invoice.status || "draft";
  };

  const toggleInvoice = (id: string) => {
    setExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build unified timeline of invoices and payments
  type TimelineItem =
    | { type: "invoice"; date: string; data: ProjectInvoice }
    | { type: "payment"; date: string; data: PaymentReceived };

  const timelineItems: TimelineItem[] = [
    ...invoices.map(inv => ({ type: "invoice" as const, date: inv.invoiceDate, data: inv })),
    ...unlinkedPayments.map(p => ({ type: "payment" as const, date: p.paymentDate, data: p })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      {/* Unified Billing Summary */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {/* Contract Section */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Initial Contract</p>
              <p className="text-lg font-bold">{formatCurrency(initialContract)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Change Orders</p>
              <p className={cn("text-lg font-bold", totalCOs >= 0 ? "text-emerald-600" : "text-red-600")}>
                {totalCOs >= 0 ? "+" : ""}{formatCurrency(totalCOs)}
              </p>
              {pendingCOs.length > 0 && (
                <p className="text-xs text-amber-600">{pendingCOs.length} pending</p>
              )}
            </div>
            <div className="space-y-1 border-l pl-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Contract Value</p>
              <p className="text-lg font-bold">{formatCurrency(adjustedContract)}</p>
            </div>

            {/* Billing Progress Section */}
            <div className="space-y-1 border-l pl-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Billed</p>
              <p className="text-lg font-bold">{formatCurrency(totalBilled)}</p>
              <p className="text-xs text-muted-foreground">
                {adjustedContract > 0 ? ((totalBilled / adjustedContract) * 100).toFixed(0) : 0}% of contract
              </p>
            </div>
            <div className="space-y-1 border-l pl-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Received</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
              <p className="text-xs text-muted-foreground">
                {totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(0) : 0}% of billed
              </p>
            </div>
            <div className="space-y-1 border-l pl-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Outstanding</p>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(totalBilled - totalPaid)}</p>
              <p className="text-xs text-muted-foreground">
                {adjustedContract > 0 ? ((adjustedContract - totalBilled) / adjustedContract * 100).toFixed(0) : 100}% remaining
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Orders Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Change Orders
            {changeOrders.length > 0 && (
              <Badge variant="secondary" className="ml-1">{changeOrders.length}</Badge>
            )}
          </h3>
          <div className="flex gap-2">
            {changeOrders.length > 0 && (
              <ExportButton
                data={changeOrders}
                filename={`change-orders-${project?.name || "project"}`}
                columns={EXPORT_COLUMNS.changeOrders}
              />
            )}
            <Button size="sm" onClick={() => setShowChangeOrderDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New CO
            </Button>
          </div>
        </div>

        {changeOrders.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <Receipt className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No change orders</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {changeOrders.map((co) => (
              <Card
                key={co.id}
                className="overflow-hidden hover:border-primary/50 cursor-pointer transition-colors"
                onClick={() => setSelectedChangeOrder(co)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={cn("text-xs", getStatusColor(co.status))}>
                        {co.status}
                      </Badge>
                      <div>
                        <span className="font-medium">CO #{co.coNumber}</span>
                        {co.description && (
                          <span className="text-sm text-muted-foreground ml-2">- {co.description}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "font-bold",
                        parseFloat(co.amount) >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {parseFloat(co.amount) >= 0 ? "+" : ""}{formatCurrency(co.amount)}
                      </p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Invoices & Payments Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoices & Payments
          </h3>
          <div className="flex gap-2">
            {invoices.length > 0 && (
              <ExportButton
                data={invoices}
                filename={`invoices-${project?.name || "project"}`}
                columns={EXPORT_COLUMNS.invoices}
              />
            )}
            {payments.length > 0 && (
              <ExportButton
                data={payments}
                filename={`payments-${project?.name || "project"}`}
                columns={EXPORT_COLUMNS.payments}
              />
            )}
            <Button variant="outline" size="sm" onClick={() => setShowCheckUpload(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Upload Check
            </Button>
            <Button size="sm" onClick={() => setShowCreateInvoice(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Invoice
            </Button>
          </div>
        </div>

        {invoices.length === 0 && payments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No invoices or payments yet</p>
              <div className="flex justify-center gap-3 mt-4">
                <Button variant="outline" onClick={() => setShowCreateInvoice(true)}>
                  Create Invoice
                </Button>
                <Button variant="outline" onClick={() => setShowCheckUpload(true)}>
                  Record Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {/* Invoices with nested payments */}
            {invoices.map((invoice) => {
              const amount = parseFloat(invoice.amount);
              const paid = getInvoicePaidAmount(invoice.id);
              const paidPercent = amount > 0 ? (paid / amount) * 100 : 0;
              const billingTypeBadge = getBillingTypeBadge(invoice.billingType);
              const status = getInvoiceStatus(invoice);
              const invoicePayments = getInvoicePayments(invoice.id);
              const isExpanded = expandedInvoices.has(invoice.id);

              return (
                <Card key={invoice.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    {/* Invoice Header */}
                    <div
                      className={cn(
                        "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                        invoicePayments.length > 0 && "border-b"
                      )}
                      onClick={() => setSelectedInvoice(invoice)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon indicator */}
                        <div className="mt-1 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
                          <FileUp className="h-4 w-4 text-blue-600" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">Invoice #{invoice.invoiceNumber}</span>
                            <Badge variant="outline" className={cn("text-xs", getStatusColor(status))}>
                              {status}
                            </Badge>
                            {billingTypeBadge && (
                              <Badge variant="outline" className={cn("text-xs", billingTypeBadge.color)}>
                                {billingTypeBadge.label}
                              </Badge>
                            )}
                          </div>
                          {invoice.poNumber && (
                            <p className="text-sm text-muted-foreground">PO: {invoice.poNumber}</p>
                          )}
                          <p className="text-sm text-muted-foreground mt-1">
                            {format(new Date(invoice.invoiceDate), "MMM d, yyyy")}
                            {invoice.dueDate && ` - Due ${format(new Date(invoice.dueDate), "MMM d")}`}
                          </p>
                        </div>

                        <div className="text-right flex items-center gap-2">
                          <div>
                            <p className="text-lg font-bold">{formatCurrency(amount)}</p>
                            {invoice.percentBilled && (
                              <p className="text-xs text-muted-foreground">{invoice.percentBilled}%</p>
                            )}
                          </div>
                          {invoicePayments.length > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleInvoice(invoice.id);
                              }}
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", !isExpanded && "-rotate-90")} />
                            </Button>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>

                      {/* Payment progress bar */}
                      {status !== "paid" && status !== "draft" && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Paid</span>
                            <span>{formatCurrency(paid)} / {formatCurrency(amount)}</span>
                          </div>
                          <Progress value={paidPercent} className="h-1.5" />
                        </div>
                      )}
                    </div>

                    {/* Nested Payments for this invoice */}
                    {invoicePayments.length > 0 && isExpanded && (
                      <div className="bg-muted/30 border-t">
                        {invoicePayments.map((payment) => (
                          <div key={payment.id} className="p-3 pl-12 border-b last:border-b-0 flex items-center gap-3">
                            <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-900/30">
                              <DollarSign className="h-3 w-3 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                Payment received
                                {payment.referenceNumber && ` - Check #${payment.referenceNumber}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(payment.paymentDate), "MMM d, yyyy")}
                                {payment.paymentMethod && ` via ${payment.paymentMethod}`}
                              </p>
                            </div>
                            <p className="font-semibold text-green-600">
                              +{formatCurrency(payment.amount)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Unlinked Payments */}
            {unlinkedPayments.length > 0 && (
              <>
                <div className="text-sm text-muted-foreground font-medium pt-2">
                  Other Payments (not linked to invoice)
                </div>
                {unlinkedPayments.map((payment) => (
                  <Card key={payment.id} className="overflow-hidden border-green-200 dark:border-green-900">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-full bg-green-100 dark:bg-green-900/30">
                          <DollarSign className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              Payment Received
                              {payment.referenceNumber && ` - Check #${payment.referenceNumber}`}
                            </span>
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                              {payment.paymentMethod || "check"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {format(new Date(payment.paymentDate), "MMM d, yyyy")}
                          </p>
                          {payment.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{payment.notes}</p>
                          )}
                        </div>
                        <p className="text-lg font-bold text-green-600">
                          +{formatCurrency(payment.amount)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateInvoiceDialog
        open={showCreateInvoice}
        onOpenChange={setShowCreateInvoice}
        project={project}
        projectId={projectId}
        changeOrders={changeOrders}
      />

      <CheckUploadDialog
        open={showCheckUpload}
        onOpenChange={setShowCheckUpload}
        projectId={projectId}
        projectName={project.name}
        invoices={invoices.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          status: getInvoiceStatus(inv),
        }))}
      />

      <ChangeOrderDialog
        open={showChangeOrderDialog}
        onOpenChange={setShowChangeOrderDialog}
        projectId={projectId}
        projectName={project.name}
        existingCOCount={changeOrders.length}
      />

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(open) => {
        if (!open) {
          setSelectedInvoice(null);
          setIsEditingInvoice(false);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              {isEditingInvoice ? "Edit Invoice" : `Invoice #${selectedInvoice?.invoiceNumber}`}
            </DialogTitle>
            <DialogDescription>
              {isEditingInvoice ? "Update invoice details" : "Invoice details and payment history"}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (() => {
            const amount = parseFloat(selectedInvoice.amount);
            const paid = getInvoicePaidAmount(selectedInvoice.id);
            const invoicePayments = getInvoicePayments(selectedInvoice.id);
            const status = getInvoiceStatus(selectedInvoice);
            const billingTypeBadge = getBillingTypeBadge(selectedInvoice.billingType);

            // Edit Mode
            if (isEditingInvoice) {
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoiceNumber">Invoice Number</Label>
                      <Input
                        id="invoiceNumber"
                        value={editInvoiceForm.invoiceNumber}
                        onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={editInvoiceForm.amount}
                        onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, amount: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoiceDate">Invoice Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={editInvoiceForm.invoiceDate}
                        onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, invoiceDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Due Date</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={editInvoiceForm.dueDate}
                        onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="poNumber">PO Number</Label>
                      <Input
                        id="poNumber"
                        value={editInvoiceForm.poNumber}
                        onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, poNumber: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="percentBilled">Percent Billed</Label>
                      <Input
                        id="percentBilled"
                        type="number"
                        step="0.01"
                        value={editInvoiceForm.percentBilled}
                        onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, percentBilled: e.target.value }))}
                        placeholder="e.g., 25"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={editInvoiceForm.status}
                        onValueChange={(value) => setEditInvoiceForm(prev => ({ ...prev, status: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billingType">Billing Type</Label>
                      <Select
                        value={editInvoiceForm.billingType}
                        onValueChange={(value) => setEditInvoiceForm(prev => ({ ...prev, billingType: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="progress">Progress</SelectItem>
                          <SelectItem value="change_order">Change Order</SelectItem>
                          <SelectItem value="labor">Labor</SelectItem>
                          <SelectItem value="final">Final</SelectItem>
                          <SelectItem value="retainage">Retainage</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={editInvoiceForm.notes}
                      onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      placeholder="Additional notes..."
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsEditingInvoice(false)}>
                      Cancel
                    </Button>
                    <Button onClick={saveInvoiceChanges} disabled={updateInvoiceMutation.isPending}>
                      {updateInvoiceMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </Button>
                  </div>
                </div>
              );
            }

            // View Mode
            return (
              <div className="space-y-6">
                {/* Status and Type */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn("text-sm", getStatusColor(status))}>
                    {status}
                  </Badge>
                  {billingTypeBadge && (
                    <Badge variant="outline" className={cn("text-sm", billingTypeBadge.color)}>
                      {billingTypeBadge.label}
                    </Badge>
                  )}
                </div>

                {/* Invoice Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice Date</p>
                    <p className="font-medium">{format(new Date(selectedInvoice.invoiceDate), "MMM d, yyyy")}</p>
                  </div>
                  {selectedInvoice.dueDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Due Date</p>
                      <p className="font-medium">{format(new Date(selectedInvoice.dueDate), "MMM d, yyyy")}</p>
                    </div>
                  )}
                  {selectedInvoice.poNumber && (
                    <div>
                      <p className="text-xs text-muted-foreground">PO Number</p>
                      <p className="font-medium">{selectedInvoice.poNumber}</p>
                    </div>
                  )}
                  {selectedInvoice.percentBilled && (
                    <div>
                      <p className="text-xs text-muted-foreground">Percent Billed</p>
                      <p className="font-medium">{selectedInvoice.percentBilled}% of contract</p>
                    </div>
                  )}
                </div>

                {/* Amount Summary */}
                <Card className="border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Invoice Amount</p>
                        <p className="text-2xl font-bold">{formatCurrency(amount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Paid</p>
                        <p className="text-2xl font-bold text-emerald-600">{formatCurrency(paid)}</p>
                      </div>
                    </div>
                    {amount > paid && (
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Balance Due</span>
                          <span className="font-semibold text-amber-600">{formatCurrency(amount - paid)}</span>
                        </div>
                        <Progress value={(paid / amount) * 100} className="h-2" />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Payment History */}
                {invoicePayments.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Payment History ({invoicePayments.length})
                    </h4>
                    <div className="space-y-2">
                      {invoicePayments.map((payment) => (
                        <div key={payment.id} className="p-3 border rounded-lg flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              {payment.referenceNumber ? `Check #${payment.referenceNumber}` : payment.paymentMethod || "Payment"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(payment.paymentDate), "MMM d, yyyy")}
                            </p>
                          </div>
                          <p className="font-semibold text-emerald-600">+{formatCurrency(payment.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedInvoice.notes && (
                  <div>
                    <h4 className="font-semibold mb-2">Notes</h4>
                    <p className="text-sm text-muted-foreground">{selectedInvoice.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between pt-4 border-t">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={startEditingInvoice}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.open(`/api/project-invoices/${selectedInvoice.id}/pdf`, "_blank");
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                  <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
                    Close
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Change Order Detail Dialog */}
      <Dialog open={!!selectedChangeOrder} onOpenChange={(open) => {
        if (!open) {
          setSelectedChangeOrder(null);
          setIsEditingCO(false);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {isEditingCO ? "Edit Change Order" : `Change Order #${selectedChangeOrder?.coNumber}`}
            </DialogTitle>
          </DialogHeader>
          {selectedChangeOrder && (() => {
            const amount = parseFloat(selectedChangeOrder.amount);
            const isPositive = amount >= 0;
            // Check if this CO has been invoiced
            const linkedInvoice = selectedChangeOrder.invoicedInId
              ? invoices.find(inv => inv.id === selectedChangeOrder.invoicedInId)
              : null;

            // Edit Mode
            if (isEditingCO) {
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="coNumber">CO Number</Label>
                      <Input
                        id="coNumber"
                        value={editCOForm.coNumber}
                        onChange={(e) => setEditCOForm(prev => ({ ...prev, coNumber: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coAmount">Amount</Label>
                      <Input
                        id="coAmount"
                        type="number"
                        step="0.01"
                        value={editCOForm.amount}
                        onChange={(e) => setEditCOForm(prev => ({ ...prev, amount: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coDescription">Description</Label>
                    <Textarea
                      id="coDescription"
                      value={editCOForm.description}
                      onChange={(e) => setEditCOForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      placeholder="Change order description..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="coPoNumber">PO Number</Label>
                      <Input
                        id="coPoNumber"
                        value={editCOForm.poNumber}
                        onChange={(e) => setEditCOForm(prev => ({ ...prev, poNumber: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coStatus">Status</Label>
                      <Select
                        value={editCOForm.status}
                        onValueChange={(value) => setEditCOForm(prev => ({ ...prev, status: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="invoiced">Invoiced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dateSubmitted">Date Submitted</Label>
                      <Input
                        id="dateSubmitted"
                        type="date"
                        value={editCOForm.dateSubmitted}
                        onChange={(e) => setEditCOForm(prev => ({ ...prev, dateSubmitted: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dateApproved">Date Approved</Label>
                      <Input
                        id="dateApproved"
                        type="date"
                        value={editCOForm.dateApproved}
                        onChange={(e) => setEditCOForm(prev => ({ ...prev, dateApproved: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coNotes">Notes</Label>
                    <Textarea
                      id="coNotes"
                      value={editCOForm.notes}
                      onChange={(e) => setEditCOForm(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      placeholder="Additional notes..."
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsEditingCO(false)}>
                      Cancel
                    </Button>
                    <Button onClick={saveCOChanges} disabled={updateCOMutation.isPending}>
                      {updateCOMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </Button>
                  </div>
                </div>
              );
            }

            // View Mode
            return (
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={cn("text-sm", getStatusColor(selectedChangeOrder.status))}
                  >
                    {selectedChangeOrder.status}
                  </Badge>
                  <p className={cn(
                    "text-2xl font-bold",
                    isPositive ? "text-emerald-600" : "text-red-600"
                  )}>
                    {isPositive ? "+" : ""}{formatCurrency(amount)}
                  </p>
                </div>

                {/* Description */}
                {selectedChangeOrder.description && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground mb-1">Description</h4>
                    <p className="text-sm">{selectedChangeOrder.description}</p>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  {selectedChangeOrder.poNumber && (
                    <div>
                      <p className="text-xs text-muted-foreground">PO Number</p>
                      <p className="font-medium">{selectedChangeOrder.poNumber}</p>
                    </div>
                  )}
                  {selectedChangeOrder.dateSubmitted && (
                    <div>
                      <p className="text-xs text-muted-foreground">Date Submitted</p>
                      <p className="font-medium">{format(new Date(selectedChangeOrder.dateSubmitted), "MMM d, yyyy")}</p>
                    </div>
                  )}
                  {selectedChangeOrder.dateApproved && (
                    <div>
                      <p className="text-xs text-muted-foreground">Date Approved</p>
                      <p className="font-medium">{format(new Date(selectedChangeOrder.dateApproved), "MMM d, yyyy")}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="font-medium">{format(new Date(selectedChangeOrder.createdAt), "MMM d, yyyy")}</p>
                  </div>
                </div>

                {/* Linked Invoice */}
                {linkedInvoice && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-700">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium text-sm">Invoiced</span>
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      Included in Invoice #{linkedInvoice.invoiceNumber} ({format(new Date(linkedInvoice.invoiceDate), "MMM d, yyyy")})
                    </p>
                  </div>
                )}

                {/* Notes */}
                {selectedChangeOrder.notes && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground mb-1">Notes</h4>
                    <p className="text-sm">{selectedChangeOrder.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between pt-4 border-t">
                  <Button variant="outline" onClick={startEditingCO}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedChangeOrder(null)}>
                    Close
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContractTab({
  project,
  changeOrders,
  projectId,
}: {
  project: ProjectWithDetails;
  changeOrders: ChangeOrder[];
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [showContractEdit, setShowContractEdit] = useState(false);
  const [showTakeoffDialog, setShowTakeoffDialog] = useState(false);
  const [showTakeoffUpload, setShowTakeoffUpload] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<BudgetLineItem | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Fetch budgets for this project
  const { data: budgetsData } = useQuery<{ ok: boolean; budgets: ProjectBudget[] }>({
    queryKey: [`/api/projects/${projectId}/budgets`],
    enabled: !!projectId,
  });
  const budgets = budgetsData?.budgets || [];
  const activeBudget = budgets.find(b => b.status === "active") || budgets[0];

  // Fetch line items for the active budget
  const { data: budgetData, isLoading: lineItemsLoading } = useQuery<{ ok: boolean; budget: ProjectBudget; lineItems: BudgetLineItem[] }>({
    queryKey: [`/api/budgets/${activeBudget?.id}`],
    enabled: !!activeBudget?.id,
  });
  const lineItems = budgetData?.lineItems || [];

  // Create budget mutation (for first-time setup)
  const createBudgetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Original Estimate",
          contractValue: project.initialProposal || "0",
        }),
      });
      if (!res.ok) throw new Error("Failed to create budget");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/budgets`] });
    },
  });

  // Delete line item mutation
  const deleteLineItemMutation = useMutation({
    mutationFn: async (lineItemId: string) => {
      const res = await fetch(`/api/budget-line-items/${lineItemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/budgets/${activeBudget?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/budgets`] });
    },
  });

  const initialContract = parseFloat(project.initialProposal || "0");
  const pending = changeOrders.filter(co => co.status === "pending");
  const totalCOs = changeOrders.reduce((sum, co) => sum + parseFloat(co.amount), 0);
  const adjustedContract = initialContract + totalCOs;

  const totalEstimatedCost = lineItems.reduce((sum, item) => sum + parseFloat(item.totalCost || "0"), 0);

  const handleAddItem = async () => {
    if (!activeBudget) {
      // Create a budget first and wait for it
      try {
        await createBudgetMutation.mutateAsync();
        // Wait a moment for the query to invalidate and refetch
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error("Failed to create budget:", err);
        return;
      }
    }
    setEditingLineItem(null);
    setShowTakeoffDialog(true);
  };

  const handleEditItem = (item: BudgetLineItem) => {
    setEditingLineItem(item);
    setShowTakeoffDialog(true);
  };

  const handleDeleteItem = (itemId: string) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteLineItemMutation.mutate(itemId);
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      metal_studs: "Metal Studs",
      drywall: "Drywall",
      ceiling_grid: "Ceiling Grid",
      ceiling_tile: "Ceiling Tile",
      insulation: "Insulation",
      fasteners: "Fasteners",
      tape_mud: "Tape & Mud",
      corner_bead: "Corner Bead",
      framing: "Framing",
      labor: "Labor",
      equipment: "Equipment",
      misc: "Misc",
    };
    return labels[category] || category;
  };

  return (
    <div className="space-y-6">
      {/* Contract Details Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Contract Details
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowContractEdit(true)}>
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)}>
              <Upload className="h-4 w-4 mr-1" />
              Upload Contract
            </Button>
          </div>
        </div>

        {showUpload && (
          <Card className="mb-4">
            <CardContent className="py-4">
              <UniversalFileUpload
                mode="receipt"
                projectId={projectId}
                projectName={project.name}
                companyId={project.companyId}
                onUploadComplete={(result) => {
                  console.log("Contract upload complete:", result);
                  setShowUpload(false);
                  queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Contract Summary - Consistent format */}
        <Card className="bg-muted/50 mb-4">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Initial Contract</p>
                <p className="font-semibold text-lg">{formatCurrency(initialContract)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Change Orders</p>
                <p className={cn("font-semibold text-lg", totalCOs >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {totalCOs >= 0 ? "+" : ""}{formatCurrency(totalCOs)}
                </p>
                {pending.length > 0 && (
                  <p className="text-xs text-muted-foreground">{pending.length} pending</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Contract Value</p>
                <p className="font-semibold text-lg">{formatCurrency(adjustedContract)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Details */}
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* GC Info Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">General Contractor</p>
              </div>
              {project.gc ? (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="font-semibold">{project.gc.name}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {project.gc.contactName && (
                      <div>
                        <span className="text-muted-foreground">Contact: </span>
                        <span>{project.gc.contactName}</span>
                      </div>
                    )}
                    {project.gc.phone && (
                      <div>
                        <span className="text-muted-foreground">Phone: </span>
                        <a href={`tel:${project.gc.phone}`} className="text-primary hover:underline">{project.gc.phone}</a>
                      </div>
                    )}
                    {project.gc.email && (
                      <div>
                        <span className="text-muted-foreground">Email: </span>
                        <a href={`mailto:${project.gc.email}`} className="text-primary hover:underline">{project.gc.email}</a>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not assigned - Edit contract to select GC</p>
              )}
            </div>

            <Separator />

            {/* Project Info Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge variant="outline" className={cn("text-xs", getStatusColor(project.status))}>
                  {project.status}
                </Badge>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Job Site Address</p>
                <p className="font-medium text-sm">{project.address || "-"}</p>
              </div>
            </div>

            <Separator />

            {/* Project Manager (POC) */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Project Manager</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Name</p>
                  <p className="font-medium text-sm">{project.pocName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Phone</p>
                  {project.pocPhone ? (
                    <a href={`tel:${project.pocPhone}`} className="text-sm text-primary hover:underline font-medium">
                      {project.pocPhone}
                    </a>
                  ) : (
                    <p className="font-medium text-sm">-</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Email</p>
                  {project.pocEmail ? (
                    <a href={`mailto:${project.pocEmail}`} className="text-sm text-primary hover:underline font-medium truncate block" title={project.pocEmail}>
                      {project.pocEmail}
                    </a>
                  ) : (
                    <p className="font-medium text-sm">-</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Material Takeoff Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Material Takeoff
            {lineItems.length > 0 && (
              <Badge variant="secondary" className="ml-2">{lineItems.length} items</Badge>
            )}
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTakeoffUpload(!showTakeoffUpload)}>
              <Upload className="h-4 w-4 mr-1" />
              {showTakeoffUpload ? "Cancel" : "Upload Takeoff"}
            </Button>
            <Button size="sm" onClick={handleAddItem} disabled={createBudgetMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </div>
        </div>

        {/* Takeoff Upload Dialog */}
        <TakeoffUploadDialog
          open={showTakeoffUpload}
          onOpenChange={setShowTakeoffUpload}
          projectId={projectId}
          projectName={project.name}
          budgetId={activeBudget?.id}
        />

        {lineItemsLoading ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Skeleton className="h-8 w-48 mx-auto" />
            </CardContent>
          </Card>
        ) : lineItems.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">No takeoff items added</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add material items to track budget vs actual
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={handleAddItem}>
                Add First Item
              </Button>
            </CardContent>
          </Card>
        ) : (() => {
          // Group items by category
          const byCategory = lineItems.reduce((acc, item) => {
            const cat = item.category || "misc";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(item);
            return acc;
          }, {} as Record<string, BudgetLineItem[]>);

          const categories = Object.keys(byCategory).sort();

          const toggleCategory = (cat: string) => {
            setExpandedCategories(prev => {
              const next = new Set(prev);
              if (next.has(cat)) next.delete(cat);
              else next.add(cat);
              return next;
            });
          };

          return (
            <div className="space-y-3">
              {categories.map((category) => {
                const items = byCategory[category];
                const categoryTotal = items.reduce((sum, i) => sum + parseFloat(i.totalCost || "0"), 0);
                const isExpanded = expandedCategories.has(category);

                return (
                  <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleCategory(category)}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ChevronDown className={cn("h-4 w-4 transition-transform", !isExpanded && "-rotate-90")} />
                              <CardTitle className="text-sm font-medium">
                                {getCategoryLabel(category)}
                              </CardTitle>
                              <Badge variant="secondary" className="text-xs">{items.length} items</Badge>
                            </div>
                            <Badge variant="outline">{formatCurrency(categoryTotal)}</Badge>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between py-2 border-t first:border-t-0">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{item.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.quantity ? `${item.quantity} ${item.unit || ""}`.trim() : ""}
                                    {item.unitCost ? ` @ ${formatCurrency(parseFloat(item.unitCost))}` : ""}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold">{formatCurrency(parseFloat(item.totalCost))}</p>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditItem(item)}>Edit</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleDeleteItem(item.id)} className="text-red-600">Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}

              {/* Total Summary */}
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Total Estimated Cost</span>
                    <span className="text-xl font-bold">{formatCurrency(totalEstimatedCost)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}
      </div>

      {/* Contract Edit Dialog */}
      <ContractEditDialog
        open={showContractEdit}
        onOpenChange={setShowContractEdit}
        project={project}
        companyId={project.companyId}
      />

      {/* Takeoff Item Dialog */}
      {activeBudget && (
        <TakeoffItemDialog
          open={showTakeoffDialog}
          onOpenChange={setShowTakeoffDialog}
          budgetId={activeBudget.id}
          projectId={projectId}
          editItem={editingLineItem}
        />
      )}

      {/* Takeoff Item Dialog - also show when no budget (will create one) */}
      {!activeBudget && showTakeoffDialog && (
        <Dialog open={showTakeoffDialog} onOpenChange={setShowTakeoffDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Creating Budget...</DialogTitle>
              <DialogDescription>
                Setting up the project budget. Please wait...
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}

function PayrollTab({
  payrollEntries,
  workers,
  projectId,
}: {
  payrollEntries: PayrollEntry[];
  workers: Worker[];
  projectId: string;
}) {
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const workerMap = new Map(workers.map(w => [w.id, w]));

  // Group by week
  const byWeek = payrollEntries.reduce((acc, entry) => {
    const key = entry.weekStart;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, PayrollEntry[]>);

  const weekKeys = Object.keys(byWeek).sort().reverse();
  const totalLabor = payrollEntries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);

  // Filter weeks based on selection
  const displayWeeks = selectedWeek === "all" ? weekKeys : weekKeys.filter(w => w === selectedWeek);

  const toggleWeek = (weekStart: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekStart)) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
  };

  // Auto-expand when single week selected
  const isExpanded = (weekStart: string) => {
    if (selectedWeek !== "all") return true;
    return expandedWeeks.has(weekStart);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Labor / Payroll</h3>
          <p className="text-sm text-muted-foreground">
            {payrollEntries.length} entries | Total: {formatCurrency(totalLabor)}
          </p>
        </div>
        {weekKeys.length > 0 && (
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Weeks ({weekKeys.length})</SelectItem>
              {weekKeys.map((weekStart) => (
                <SelectItem key={weekStart} value={weekStart}>
                  {format(new Date(weekStart), "MMM d, yyyy")} ({formatCurrency(byWeek[weekStart].reduce((s, e) => s + parseFloat(e.totalPay), 0))})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {weekKeys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No payroll entries for this project</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayWeeks.map((weekStart) => {
            const entries = byWeek[weekStart];
            const weekTotal = entries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);
            const weekDays = entries.reduce((sum, e) => sum + parseFloat(e.daysWorked), 0);
            const expanded = isExpanded(weekStart);

            return (
              <Collapsible key={weekStart} open={expanded} onOpenChange={() => toggleWeek(weekStart)}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              !expanded && "-rotate-90"
                            )}
                          />
                          <CardTitle className="text-sm font-medium">
                            Week of {format(new Date(weekStart), "MMM d, yyyy")}
                          </CardTitle>
                        </div>
                        <Badge variant="outline">{formatCurrency(weekTotal)}</Badge>
                      </div>
                      <CardDescription className="ml-6">{entries.length} workers | {weekDays} days</CardDescription>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {entries.map((entry) => {
                          const worker = workerMap.get(entry.workerId);
                          const basePay = parseFloat(entry.basePay || "0");
                          const parking = parseFloat(entry.parking || "0");
                          const dailyRate = parseFloat(entry.dailyRate || "0");
                          const daysWorked = parseFloat(entry.daysWorked || "0");

                          return (
                            <div key={entry.id} className="flex items-center justify-between py-2 border-t first:border-t-0">
                              <div>
                                <p className="font-medium text-sm">{worker?.name || "Unknown"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {daysWorked > 0 ? (
                                    <>{daysWorked} days @ {formatCurrency(dailyRate)}/day</>
                                  ) : basePay > 0 ? (
                                    <>Base: {formatCurrency(basePay)}</>
                                  ) : (
                                    <>Flat rate</>
                                  )}
                                  {parking > 0 && ` + ${formatCurrency(parking)} parking`}
                                </p>
                              </div>
                              <p className="font-semibold">{formatCurrency(entry.totalPay)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CostsTab({
  projectId,
  projectName,
  companyId,
  totalMaterialCost,
}: {
  projectId: string;
  projectName: string;
  companyId: string;
  totalMaterialCost: number;
}) {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  // Fetch vendor invoices/expenses for this project
  const { data: invoicesData } = useQuery<{ invoices: any[]; totalMaterials: number }>({
    queryKey: [`/api/projects/${projectId}/materials/summary`],
    enabled: !!projectId,
  });

  // Fetch invoice details when one is selected
  const { data: invoiceDetail, isLoading: invoiceDetailLoading } = useQuery<{
    ok: boolean;
    invoice: any;
    lineItems: any[];
  }>({
    queryKey: ["/api/invoices", selectedInvoiceId],
    enabled: !!selectedInvoiceId,
  });

  // Fetch budget for budgeted amount
  const { data: budgetsData } = useQuery<{ ok: boolean; budgets: ProjectBudget[] }>({
    queryKey: [`/api/projects/${projectId}/budgets`],
    enabled: !!projectId,
  });
  const activeBudget = budgetsData?.budgets?.find(b => b.status === "active") || budgetsData?.budgets?.[0];
  const budgetedAmount = activeBudget ? parseFloat(activeBudget.estimatedCost || "0") : 0;

  // Use actual materials data from API
  const spentAmount = invoicesData?.totalMaterials || totalMaterialCost;

  const handleUploadComplete = (result: any) => {
    console.log("Upload complete:", result);
    // Refresh the invoices list
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/materials/summary`] });
  };

  // Map vendor invoices from API response
  const vendorInvoices = (invoicesData?.invoices || []).map((inv: any) => ({
    id: inv.id,
    date: inv.invoiceDate || "",
    vendor: inv.vendor || "Unknown",
    invoiceNumber: inv.invoiceNumber || "N/A",
    category: inv.primaryCategory || "misc",
    categories: inv.categories || [],
    amount: parseFloat(inv.total || "0"),
    lineItemCount: inv.lineItemCount || 0,
  }));

  // Category display helper
  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      drywall: "Drywall",
      framing: "Framing",
      concrete: "Concrete",
      paint: "Paint",
      electrical: "Electrical",
      plumbing: "Plumbing",
      hvac: "HVAC",
      tools: "Tools",
      misc: "Misc",
      ceiling_grid: "Ceiling Grid",
      metal_angles: "Metal/Angles",
      metal_studs: "Metal Studs",
      insulation: "Insulation",
      fasteners: "Fasteners",
      tape_compound: "Tape & Compound",
      accessories: "Accessories",
    };
    return labels[category] || category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      drywall: "bg-blue-100 text-blue-700",
      framing: "bg-amber-100 text-amber-700",
      concrete: "bg-gray-100 text-gray-700",
      paint: "bg-purple-100 text-purple-700",
      electrical: "bg-yellow-100 text-yellow-700",
      plumbing: "bg-cyan-100 text-cyan-700",
      hvac: "bg-green-100 text-green-700",
      tools: "bg-orange-100 text-orange-700",
      misc: "bg-slate-100 text-slate-700",
      ceiling_grid: "bg-indigo-100 text-indigo-700",
      metal_angles: "bg-teal-100 text-teal-700",
      metal_studs: "bg-zinc-100 text-zinc-700",
      insulation: "bg-pink-100 text-pink-700",
      fasteners: "bg-rose-100 text-rose-700",
      tape_compound: "bg-lime-100 text-lime-700",
      accessories: "bg-sky-100 text-sky-700",
    };
    return colors[category] || "bg-slate-100 text-slate-700";
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Budgeted</p>
            <p className="text-2xl font-bold">{formatCurrency(budgetedAmount)}</p>
            <p className="text-xs text-muted-foreground">From takeoff</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Spent</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(spentAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Remaining</p>
            <p className={cn(
              "text-2xl font-bold",
              budgetedAmount - spentAmount >= 0 ? "text-emerald-600" : "text-red-600"
            )}>
              {formatCurrency(budgetedAmount - spentAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upload Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Material Purchases
          </h3>
          <p className="text-sm text-muted-foreground">Vendor invoices and receipts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? (
              <>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1" />
                Upload Receipt
              </>
            )}
          </Button>
          <Button size="sm" onClick={() => setShowManualEntry(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Manually
          </Button>
        </div>
      </div>

      {showUpload && (
        <UniversalFileUpload
          mode="receipt"
          projectId={projectId}
          projectName={projectName}
          companyId={companyId}
          onUploadComplete={handleUploadComplete}
          onProjectMismatch={(matchedProject) => {
            // Don't auto-redirect - just log. User can see the data and save to current project
            console.log(`[CostsTab] Invoice detected for project: ${matchedProject.name}`);
          }}
          onSave={async (data, targetProjectId) => {
            console.log("[CostsTab onSave] Starting...", { data, targetProjectId, projectId });

            // Extract fields from the AI-extracted data
            const getField = (name: string) =>
              data.fields.find((f) => f.field === name)?.value;

            const saveProjectId = targetProjectId || projectId;

            const payload = {
              companyId,
              vendor: getField("vendor"),
              invoiceNumber: getField("invoiceNumber"),
              invoiceDate: getField("date"),
              total: getField("total"),
              subtotal: getField("subtotal"),
              tax: getField("tax"),
              lineItems: data.lineItems || [],
            };

            console.log("[CostsTab onSave] Payload:", payload);
            console.log("[CostsTab onSave] Sending to:", `/api/projects/${saveProjectId}/vendor-invoices`);

            const response = await fetch(`/api/projects/${saveProjectId}/vendor-invoices`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            console.log("[CostsTab onSave] Response status:", response.status);

            if (!response.ok) {
              const err = await response.json();
              console.error("[CostsTab onSave] Error:", err);
              throw new Error(err.error || "Failed to save invoice");
            }

            const result = await response.json();
            console.log("[CostsTab onSave] Success:", result);

            // Refresh the invoices list
            queryClient.invalidateQueries({ queryKey: [`/api/projects/${saveProjectId}/materials/summary`] });
            setShowUpload(false);
          }}
        />
      )}

      {/* Expenses List */}
      {vendorInvoices.length === 0 && !showUpload ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No expenses recorded</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload receipts or add expenses manually
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload First Receipt
            </Button>
          </CardContent>
        </Card>
      ) : vendorInvoices.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorInvoices.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                >
                  <TableCell>{format(new Date(invoice.date), "MMM d")}</TableCell>
                  <TableCell className="font-medium">{invoice.vendor}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn("text-xs", getCategoryColor(invoice.category))}>
                      {getCategoryLabel(invoice.category)}
                    </Badge>
                    {invoice.lineItemCount > 1 && (
                      <span className="text-xs text-muted-foreground ml-2">
                        +{invoice.lineItemCount - 1} items
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedInvoiceId(invoice.id); }}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {/* Invoice Detail Sheet */}
      <Sheet open={!!selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)}>
        <SheetContent className="w-[500px] sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Invoice Details</SheetTitle>
            <SheetDescription>
              {invoiceDetail?.invoice?.vendor} - #{invoiceDetail?.invoice?.invoiceNumber}
            </SheetDescription>
          </SheetHeader>

          {invoiceDetailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : invoiceDetail ? (
            <div className="mt-6 space-y-6">
              {/* Invoice Summary */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{invoiceDetail.invoice.invoiceDate ? format(new Date(invoiceDetail.invoice.invoiceDate), "MMM d, yyyy") : "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice #</p>
                  <p className="font-medium">{invoiceDetail.invoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                  <p className="font-medium">{formatCurrency(invoiceDetail.invoice.subtotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tax</p>
                  <p className="font-medium">{formatCurrency(invoiceDetail.invoice.tax)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{formatCurrency(invoiceDetail.invoice.total)}</p>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Line Items ({invoiceDetail.lineItems?.length || 0})
                </h4>
                <div className="space-y-3">
                  {(invoiceDetail.lineItems || []).map((item: any, idx: number) => (
                    <div key={item.id || idx} className="p-3 border rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.description}</p>
                          {item.productCode && (
                            <p className="text-xs text-muted-foreground">SKU: {item.productCode}</p>
                          )}
                        </div>
                        <Badge variant="secondary" className={cn("text-xs shrink-0", getCategoryColor(item.category || "misc"))}>
                          {getCategoryLabel(item.category || "misc")}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Qty:</span>{" "}
                          <span className="font-medium">{item.quantity || "-"} {item.unit || ""}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Unit Price:</span>{" "}
                          <span className="font-medium">{item.unitPrice ? formatCurrency(item.unitPrice) : "-"}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-muted-foreground">Amount:</span>{" "}
                          <span className="font-medium">{formatCurrency(item.lineAmount)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Manual Invoice Entry Dialog */}
      <ManualInvoiceDialog
        open={showManualEntry}
        onOpenChange={setShowManualEntry}
        projectId={projectId}
        projectName={projectName}
        companyId={companyId}
      />
    </div>
  );
}

// ========== Main Component ==========

export default function ProjectCRM() {
  const [, params] = useRoute("/projects/:id/crm");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const projectId = params?.id;

  // Fetch project
  const { data: project, isLoading: projectLoading } = useQuery<ProjectWithDetails>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch GC if project has one
  const { data: gc } = useQuery<GeneralContractor>({
    queryKey: ["/api/general-contractors", project?.gcId],
    enabled: !!project?.gcId,
  });

  // Fetch change orders
  const { data: changeOrdersData } = useQuery<{ ok: boolean; changeOrders: ChangeOrder[] }>({
    queryKey: [`/api/projects/${projectId}/change-orders`],
    enabled: !!projectId,
  });
  const changeOrders = changeOrdersData?.changeOrders || [];

  // Fetch project invoices (TO GC)
  const { data: invoicesData } = useQuery<{ ok: boolean; invoices: ProjectInvoice[] }>({
    queryKey: [`/api/projects/${projectId}/project-invoices`],
    enabled: !!projectId,
  });
  const invoices = invoicesData?.invoices || [];

  // Fetch payments
  const { data: paymentsData } = useQuery<{ ok: boolean; payments: PaymentReceived[] }>({
    queryKey: [`/api/projects/${projectId}/payments-received`],
    enabled: !!projectId,
  });
  const payments = paymentsData?.payments || [];

  // Fetch payroll
  const { data: payrollData } = useQuery<{ ok: boolean; entries: PayrollEntry[]; totalLaborCost: number }>({
    queryKey: [`/api/projects/${projectId}/payroll`],
    enabled: !!projectId,
  });
  const payrollEntries = payrollData?.entries || [];
  const laborCost = payrollData?.totalLaborCost || 0;

  // Fetch workers
  const { data: workersData } = useQuery<{ ok: boolean; workers: Worker[] }>({
    queryKey: [`/api/companies/${project?.companyId}/workers`],
    enabled: !!project?.companyId,
  });
  const workers = workersData?.workers || [];

  // Fetch materials summary
  const { data: materialsSummary } = useQuery<{ totalMaterials: number }>({
    queryKey: [`/api/projects/${projectId}/materials/summary`],
    enabled: !!projectId,
  });
  const materialCost = materialsSummary?.totalMaterials || 0;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();

  // Update percent complete mutation
  const updatePercentMutation = useMutation({
    mutationFn: async (percentComplete: number) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percentComplete: percentComplete.toString() }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    },
  });

  // Update project status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Status updated" });
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
      navigate("/projects");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
    },
  });

  if (projectLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
            <p className="mt-4 font-medium">Project not found</p>
            <Button className="mt-4" onClick={() => navigate("/projects")}>
              Back to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/projects")} className="shrink-0 -ml-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold truncate">{project.name}</h1>
                <Badge variant="outline" className={cn("shrink-0", getStatusColor(project.status))}>
                  {project.status}
                </Badge>
              </div>
              {gc && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Building2 className="h-3 w-3" />
                  <span className="truncate">{gc.name}</span>
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Badge variant="outline" className={cn("mr-2 text-xs", getStatusColor(project.status))}>
                      {project.status}
                    </Badge>
                    Change Status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => updateStatusMutation.mutate("active")}
                      disabled={project.status === "active"}
                    >
                      <Badge variant="outline" className="mr-2 bg-green-50 text-green-700 border-green-200">active</Badge>
                      Active
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateStatusMutation.mutate("completed")}
                      disabled={project.status === "completed"}
                    >
                      <Badge variant="outline" className="mr-2 bg-blue-50 text-blue-700 border-blue-200">completed</Badge>
                      Completed
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateStatusMutation.mutate("on_hold")}
                      disabled={project.status === "on_hold"}
                    >
                      <Badge variant="outline" className="mr-2 bg-yellow-50 text-yellow-700 border-yellow-200">on_hold</Badge>
                      On Hold
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => updateStatusMutation.mutate("cancelled")}
                      disabled={project.status === "cancelled"}
                    >
                      <Badge variant="outline" className="mr-2 bg-red-50 text-red-700 border-red-200">cancelled</Badge>
                      Cancelled
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Quick Info Bar */}
          <div className="flex items-center gap-4 mt-3 text-sm overflow-x-auto pb-1">
            {project.address && (
              <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[150px]">{project.address}</span>
              </div>
            )}
            {project.pocName && (
              <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                <Phone className="h-3 w-3 shrink-0" />
                <span>{project.pocName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="overview" className="flex-shrink-0">Overview</TabsTrigger>
            <TabsTrigger value="contract" className="flex-shrink-0">Contract</TabsTrigger>
            <TabsTrigger value="billing" className="flex-shrink-0">Billing</TabsTrigger>
            <TabsTrigger value="costs" className="flex-shrink-0">Costs</TabsTrigger>
            <TabsTrigger value="payroll" className="flex-shrink-0">Payroll</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview" className="mt-0">
              <OverviewTab
                project={project}
                changeOrders={changeOrders}
                invoices={invoices}
                payments={payments}
                laborCost={laborCost}
                materialCost={materialCost}
                onUpdatePercent={(v) => updatePercentMutation.mutate(v)}
                isUpdating={updatePercentMutation.isPending}
                projectId={projectId!}
              />
            </TabsContent>

            <TabsContent value="contract" className="mt-0">
              <ContractTab
                project={project}
                changeOrders={changeOrders}
                projectId={projectId!}
              />
            </TabsContent>

            <TabsContent value="billing" className="mt-0">
              <BillingTab
                invoices={invoices}
                payments={payments}
                project={project}
                projectId={projectId!}
                changeOrders={changeOrders}
              />
            </TabsContent>

            <TabsContent value="costs" className="mt-0">
              <CostsTab
                projectId={projectId!}
                projectName={project.name}
                companyId={project.companyId}
                totalMaterialCost={materialCost}
              />
            </TabsContent>

            <TabsContent value="payroll" className="mt-0">
              <PayrollTab
                payrollEntries={payrollEntries}
                workers={workers}
                projectId={projectId!}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{project.name}"? This will also delete all related invoices, payroll entries, and daily logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProjectMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteProjectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
