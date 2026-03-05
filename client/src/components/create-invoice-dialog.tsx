import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  DollarSign,
  Percent,
  Users,
  FileText,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { ProjectWithDetails, ChangeOrder, GeneralContractor, PayrollEntry } from "@/lib/types";

type BillingType = "progress" | "change_order" | "labor" | "final" | "retainage" | "custom";

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithDetails;
  projectId: string;
  changeOrders: ChangeOrder[];
  onSuccess?: () => void;
}

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

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  project,
  projectId,
  changeOrders,
  onSuccess,
}: CreateInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [billingType, setBillingType] = useState<BillingType>("progress");
  const [percentBilled, setPercentBilled] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedChangeOrders, setSelectedChangeOrders] = useState<string[]>([]);
  const [includeLabor, setIncludeLabor] = useState(false);
  const [laborWeekStart, setLaborWeekStart] = useState("");
  const [useCustomAmount, setUseCustomAmount] = useState(false);
  const [withRetainage, setWithRetainage] = useState(true); // Default: withhold retainage

  // Fetch GC for payment terms
  const { data: gc } = useQuery<GeneralContractor>({
    queryKey: ["/api/general-contractors", project.gcId],
    enabled: !!project.gcId,
  });

  // Fetch existing invoices to calculate cumulative percent
  const { data: invoicesData } = useQuery<{ ok: boolean; invoices: any[] }>({
    queryKey: [`/api/projects/${projectId}/invoices`],
    enabled: !!projectId && open,
  });
  const existingInvoices = invoicesData?.invoices || [];

  // Fetch payroll data for labor billing
  const { data: payrollData } = useQuery<{ ok: boolean; entries: PayrollEntry[]; totalLaborCost: number }>({
    queryKey: [`/api/projects/${projectId}/payroll`],
    enabled: !!projectId && open,
  });
  const payrollEntries = payrollData?.entries || [];
  const totalLaborCost = payrollData?.totalLaborCost || 0;

  // Calculate contract values
  const initialContract = parseFloat(project.initialProposal || "0");
  const approvedCOs = changeOrders.filter(co => co.status === "approved");
  const totalCOAmount = approvedCOs.reduce((sum, co) => sum + parseFloat(co.amount), 0);
  const adjustedContract = initialContract + totalCOAmount;

  // Calculate cumulative percent already billed (only from progress billing)
  const cumulativePercentBilled = existingInvoices
    .filter(inv => inv.billingType === "progress")
    .reduce((sum, inv) => sum + parseFloat(inv.percentBilled || "0"), 0);

  const remainingPercent = Math.max(0, 100 - cumulativePercentBilled);

  // Get unbilled change orders (approved but not yet invoiced)
  const unbilledCOs = changeOrders.filter(
    co => co.status === "approved" && !co.invoicedInId
  );

  // Get unique payroll weeks
  const payrollWeeks = useMemo(() => {
    const weeks = new Map<string, { weekStart: string; weekEnd: string; total: number; count: number }>();
    for (const entry of payrollEntries) {
      const key = entry.weekStart;
      if (!weeks.has(key)) {
        weeks.set(key, {
          weekStart: entry.weekStart,
          weekEnd: entry.weekEnd,
          total: 0,
          count: 0,
        });
      }
      const w = weeks.get(key)!;
      w.total += parseFloat(entry.totalPay);
      w.count += 1;
    }
    return Array.from(weeks.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [payrollEntries]);

  // Check if contract has value
  const hasContractValue = initialContract > 0;

  // Calculate invoice amount based on selections
  const calculatedAmount = useMemo(() => {
    let amount = 0;

    if (billingType === "progress") {
      if (useCustomAmount && customAmount) {
        amount = parseFloat(customAmount) || 0;
      } else {
        const percent = parseFloat(percentBilled) || 0;
        amount = (percent / 100) * initialContract; // Progress from INITIAL contract only
      }
    } else if (billingType === "change_order") {
      amount = selectedChangeOrders.reduce((sum, coId) => {
        const co = changeOrders.find(c => c.id === coId);
        return sum + (co ? parseFloat(co.amount) : 0);
      }, 0);
    } else if (billingType === "labor") {
      if (laborWeekStart) {
        const selectedEntries = payrollEntries.filter(
          e => e.weekStart === laborWeekStart
        );
        amount = selectedEntries.reduce((sum, e) => sum + parseFloat(e.totalPay), 0);
      }
    } else if (billingType === "final") {
      // Final billing = remaining contract amount
      const totalPreviouslyBilled = existingInvoices
        .filter(inv => inv.billingType === "progress")
        .reduce((sum, inv) => sum + parseFloat(inv.amount || "0"), 0);
      amount = initialContract - totalPreviouslyBilled;
    } else if (billingType === "retainage") {
      // Retainage = retention percent of total billed
      const retentionPercent = gc?.retentionPercent ? parseFloat(gc.retentionPercent) : 10;
      const totalBilled = existingInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.amount || "0"),
        0
      );
      amount = (retentionPercent / 100) * totalBilled;
    } else if (billingType === "custom") {
      amount = parseFloat(customAmount) || 0;
    }

    // Add labor if selected (for progress billing)
    if (includeLabor && billingType === "progress" && laborWeekStart) {
      const laborAmount = payrollEntries
        .filter(e => e.weekStart === laborWeekStart)
        .reduce((sum, e) => sum + parseFloat(e.totalPay), 0);
      amount += laborAmount;
    }

    return amount;
  }, [
    billingType,
    percentBilled,
    customAmount,
    useCustomAmount,
    initialContract,
    selectedChangeOrders,
    changeOrders,
    laborWeekStart,
    payrollEntries,
    existingInvoices,
    includeLabor,
    gc,
  ]);

  // Calculate retainage amount (typically 10% withheld by GC)
  const retainagePercent = gc?.retentionPercent ? parseFloat(gc.retentionPercent) : 10;
  const retainageAmount = useMemo(() => {
    if (!withRetainage || billingType === "retainage") return 0;
    return (retainagePercent / 100) * calculatedAmount;
  }, [calculatedAmount, retainagePercent, withRetainage, billingType]);

  // Net amount after retainage
  const netAmount = calculatedAmount - retainageAmount;

  // Calculate percentage from custom amount
  const calculatedPercent = useMemo(() => {
    if (!useCustomAmount || !customAmount || initialContract <= 0) return null;
    const amount = parseFloat(customAmount) || 0;
    return ((amount / initialContract) * 100).toFixed(2);
  }, [customAmount, useCustomAmount, initialContract]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      // Generate next invoice number
      const lastInvoice = existingInvoices[0];
      if (lastInvoice?.invoiceNumber) {
        const lastNum = parseInt(lastInvoice.invoiceNumber.replace(/\D/g, "")) || 0;
        setInvoiceNumber(`${lastNum + 1}`);
      } else {
        setInvoiceNumber("1001");
      }

      // Set default due date based on GC payment terms
      const paymentDays = gc?.paymentTermsDays ? parseInt(gc.paymentTermsDays) : 30;
      setDueDate(format(addDays(new Date(), paymentDays), "yyyy-MM-dd"));

      // Reset other fields
      setBillingType(hasContractValue ? "progress" : "change_order");
      setPercentBilled("");
      setCustomAmount("");
      setPoNumber("");
      setNotes("");
      setSelectedChangeOrders([]);
      setIncludeLabor(false);
      setLaborWeekStart("");
      setUseCustomAmount(false);
    }
  }, [open, existingInvoices, gc, hasContractValue]);

  // Create invoice mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      // Calculate cumulative percent
      let cumulativePercent = cumulativePercentBilled;
      let percentToSave = percentBilled;

      if (billingType === "progress") {
        if (useCustomAmount && calculatedPercent) {
          cumulativePercent += parseFloat(calculatedPercent);
          percentToSave = calculatedPercent;
        } else {
          cumulativePercent += parseFloat(percentBilled) || 0;
        }
      } else if (billingType === "final") {
        cumulativePercent = 100;
        percentToSave = remainingPercent.toFixed(2);
      }

      const payload = {
        invoiceNumber,
        poNumber: poNumber || null,
        invoiceDate,
        amount: calculatedAmount.toFixed(2),
        percentBilled: (billingType === "progress" || billingType === "final") ? percentToSave : null,
        cumulativePercent: cumulativePercent.toFixed(2),
        // Retainage tracking
        retainagePercent: withRetainage && billingType !== "retainage" ? retainagePercent.toFixed(2) : null,
        retainageAmount: withRetainage && billingType !== "retainage" ? retainageAmount.toFixed(2) : null,
        retainageReleased: billingType === "retainage" ? true : false,
        retainageReleasedDate: billingType === "retainage" ? invoiceDate : null,
        billingType,
        includesChangeOrders: selectedChangeOrders.length > 0 ? selectedChangeOrders : null,
        status: "draft",
        dueDate: dueDate || null,
        notes: notes || null,
      };

      console.log("[CreateInvoice] Sending payload:", payload);

      const res = await fetch(`/api/projects/${projectId}/project-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("[CreateInvoice] API error:", err);
        throw new Error(err.error || "Failed to create invoice");
      }

      const result = await res.json();
      console.log("[CreateInvoice] Success:", result);

      // Mark selected change orders as invoiced
      if (selectedChangeOrders.length > 0 && result.projectInvoice?.id) {
        for (const coId of selectedChangeOrders) {
          await fetch(`/api/change-orders/${coId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "invoiced",
              invoicedInId: result.projectInvoice.id,
            }),
          });
        }
      }

      return result;
    },
    onSuccess: () => {
      toast({
        title: "Invoice Created",
        description: `Invoice #${invoiceNumber} for ${formatCurrency(calculatedAmount)} has been created.`,
      });
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/project-invoices`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/invoices`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/change-orders`] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoiceNumber.trim()) {
      toast({
        title: "Invoice number required",
        description: "Please enter an invoice number",
        variant: "destructive",
      });
      return;
    }

    if (calculatedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Invoice amount must be greater than zero",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate();
  };

  const toggleChangeOrder = (coId: string) => {
    setSelectedChangeOrders(prev =>
      prev.includes(coId) ? prev.filter(id => id !== coId) : [...prev, coId]
    );
  };

  // Determine if user can create this type of invoice
  const canCreateProgress = hasContractValue;
  const canCreateCO = unbilledCOs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription>
            Create an invoice to send to the general contractor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contract Summary */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="grid grid-cols-5 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Initial Contract</p>
                  <p className="font-semibold">{formatCurrency(initialContract)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Change Orders</p>
                  <p className={cn("font-semibold", totalCOAmount >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {totalCOAmount >= 0 ? "+" : ""}{formatCurrency(totalCOAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Contract Value</p>
                  <p className="font-semibold">{formatCurrency(adjustedContract)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Previously Billed</p>
                  <p className="font-semibold">{cumulativePercentBilled.toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Remaining</p>
                  <p className="font-semibold text-emerald-600">{remainingPercent.toFixed(0)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Billing Type */}
          <div className="grid gap-2">
            <Label>Billing Type</Label>
            <Select
              value={billingType}
              onValueChange={(v) => {
                setBillingType(v as BillingType);
                setUseCustomAmount(false);
                setCustomAmount("");
                setPercentBilled("");
                setSelectedChangeOrders([]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="progress" disabled={!canCreateProgress}>
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Progress Billing
                    {!canCreateProgress && <span className="text-xs text-muted-foreground">(no contract)</span>}
                  </div>
                </SelectItem>
                <SelectItem value="change_order" disabled={!canCreateCO}>
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Change Order Invoice
                    {!canCreateCO && <span className="text-xs text-muted-foreground">(no unbilled COs)</span>}
                  </div>
                </SelectItem>
                <SelectItem value="labor">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Labor Billing
                  </div>
                </SelectItem>
                <SelectItem value="final" disabled={!canCreateProgress}>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Final Billing
                  </div>
                </SelectItem>
                <SelectItem value="retainage">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Retainage Release
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Progress Billing Options */}
          {billingType === "progress" && (
            <div className="space-y-4">
              {!hasContractValue ? (
                <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">No contract value set</p>
                        <p>Please add an initial contract amount in the Contract tab before creating progress invoices.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Toggle between % and $ input */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={!useCustomAmount ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUseCustomAmount(false)}
                    >
                      <Percent className="h-4 w-4 mr-1" />
                      By Percentage
                    </Button>
                    <Button
                      type="button"
                      variant={useCustomAmount ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUseCustomAmount(true)}
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      By Amount
                    </Button>
                  </div>

                  {!useCustomAmount ? (
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Label htmlFor="percentBilled">Percent to Bill (%)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="percentBilled"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={percentBilled}
                            onChange={(e) => setPercentBilled(e.target.value)}
                            className="w-24"
                            placeholder="0"
                          />
                          <span className="text-sm text-muted-foreground">
                            of {formatCurrency(initialContract)}
                          </span>
                        </div>
                        {parseFloat(percentBilled) > remainingPercent && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Exceeds remaining {remainingPercent.toFixed(0)}% of contract
                          </p>
                        )}
                      </div>

                      {/* Quick percentages */}
                      <div className="flex flex-wrap gap-2">
                        {[10, 25, 50].map((pct) => (
                          <Button
                            key={pct}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPercentBilled(pct.toString())}
                            className={cn(
                              percentBilled === pct.toString() && "border-primary bg-primary/10"
                            )}
                          >
                            {pct}%
                          </Button>
                        ))}
                        {remainingPercent > 0 && remainingPercent !== 10 && remainingPercent !== 25 && remainingPercent !== 50 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPercentBilled(remainingPercent.toFixed(0))}
                            className={cn(
                              percentBilled === remainingPercent.toFixed(0) && "border-primary bg-primary/10"
                            )}
                          >
                            {remainingPercent.toFixed(0)}% (remaining)
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label htmlFor="customAmount">Amount to Bill</Label>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            id="customAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            className="pl-7"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      {calculatedPercent && (
                        <p className="text-sm text-muted-foreground">
                          = {calculatedPercent}% of contract
                        </p>
                      )}
                    </div>
                  )}

                  {/* Retainage Option */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="withRetainage"
                      checked={withRetainage}
                      onCheckedChange={(checked) => setWithRetainage(checked === true)}
                    />
                    <Label htmlFor="withRetainage" className="text-sm font-normal">
                      GC withholds {retainagePercent}% retainage
                    </Label>
                  </div>

                  {/* Include Labor Option */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeLabor"
                      checked={includeLabor}
                      onCheckedChange={(checked) => setIncludeLabor(checked === true)}
                    />
                    <Label htmlFor="includeLabor" className="text-sm font-normal">
                      Include labor costs in this invoice
                    </Label>
                  </div>

                  {includeLabor && payrollWeeks.length > 0 && (
                    <div className="grid gap-2 pl-6">
                      <Label>Select Payroll Week</Label>
                      <Select value={laborWeekStart} onValueChange={setLaborWeekStart}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select week" />
                        </SelectTrigger>
                        <SelectContent>
                          {payrollWeeks.map((week) => (
                            <SelectItem key={week.weekStart} value={week.weekStart}>
                              Week of {format(new Date(week.weekStart), "MMM d")} - {formatCurrency(week.total)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Labor Billing Options */}
          {billingType === "labor" && (
            <div className="space-y-4">
              {payrollWeeks.length === 0 ? (
                <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                  <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">
                    No payroll entries found for this project.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-2">
                  <Label>Select Payroll Week</Label>
                  <Select value={laborWeekStart} onValueChange={setLaborWeekStart}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select week to bill" />
                    </SelectTrigger>
                    <SelectContent>
                      {payrollWeeks.map((week) => (
                        <SelectItem key={week.weekStart} value={week.weekStart}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>Week of {format(new Date(week.weekStart), "MMM d, yyyy")}</span>
                            <Badge variant="secondary">{formatCurrency(week.total)}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Total labor for project: {formatCurrency(totalLaborCost)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Change Order Selection */}
          {billingType === "change_order" && (
            <div className="space-y-4">
              {unbilledCOs.length === 0 ? (
                <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                  <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">
                    No approved change orders available to invoice.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  <Label>Select Change Orders to Include</Label>
                  <p className="text-xs text-muted-foreground">
                    These are approved COs that haven't been invoiced yet
                  </p>
                  {unbilledCOs.map((co) => (
                    <div
                      key={co.id}
                      className={cn(
                        "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors",
                        selectedChangeOrders.includes(co.id)
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground/50"
                      )}
                      onClick={() => toggleChangeOrder(co.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedChangeOrders.includes(co.id)}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => toggleChangeOrder(co.id)}
                        />
                        <div>
                          <p className="font-medium">CO #{co.coNumber}</p>
                          {co.description && (
                            <p className="text-sm text-muted-foreground">{co.description}</p>
                          )}
                        </div>
                      </div>
                      <span className={cn(
                        "font-semibold",
                        parseFloat(co.amount) >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {parseFloat(co.amount) >= 0 ? "+" : ""}{formatCurrency(co.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Final Billing Info */}
          {billingType === "final" && (
            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
              <CardContent className="p-4 text-sm text-blue-800 dark:text-blue-200">
                Final billing will invoice the remaining {remainingPercent.toFixed(0)}% of the contract ({formatCurrency((remainingPercent / 100) * initialContract)}).
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="invoiceNumber">Invoice Number *</Label>
              <Input
                id="invoiceNumber"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="1001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="poNumber">PO Number</Label>
              <Input
                id="poNumber"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="GC's PO number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoiceDate">Invoice Date</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for the invoice..."
              className="resize-none"
              rows={2}
            />
          </div>

          {/* Amount Summary */}
          <Card className={cn(
            "border-2",
            calculatedAmount > 0 ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20" : ""
          )}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Amount</p>
                  <p className="text-3xl font-bold">{formatCurrency(calculatedAmount)}</p>
                </div>
                <DollarSign className="h-10 w-10 text-emerald-500/50" />
              </div>
              {billingType === "progress" && !useCustomAmount && percentBilled && (
                <p className="text-sm text-muted-foreground mt-2">
                  {percentBilled}% of {formatCurrency(initialContract)} contract
                  {includeLabor && laborWeekStart && " + labor"}
                </p>
              )}
              {billingType === "progress" && useCustomAmount && calculatedPercent && (
                <p className="text-sm text-muted-foreground mt-2">
                  {calculatedPercent}% of {formatCurrency(initialContract)} contract
                </p>
              )}
              {billingType === "change_order" && selectedChangeOrders.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedChangeOrders.length} change order{selectedChangeOrders.length !== 1 ? "s" : ""}
                </p>
              )}
              {/* Retainage breakdown */}
              {withRetainage && retainageAmount > 0 && billingType !== "retainage" && (
                <div className="mt-3 pt-3 border-t space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Retainage withheld ({retainagePercent}%)</span>
                    <span className="text-amber-600">- {formatCurrency(retainageAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Net payment expected</span>
                    <span className="text-emerald-600">{formatCurrency(netAmount)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !invoiceNumber.trim() || calculatedAmount <= 0}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Invoice
            </Button>
          </DialogFooter>

          {createMutation.isError && (
            <p className="text-sm text-red-600 mt-2">
              {createMutation.error?.message || "An error occurred"}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
