import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Receipt, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LineItem {
  id: string;
  description: string;
  category: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineAmount: string;
}

interface ManualInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  companyId: string;
}

const CATEGORIES = [
  { value: "drywall", label: "Drywall" },
  { value: "framing", label: "Framing" },
  { value: "metal_studs", label: "Metal Studs" },
  { value: "ceiling_grid", label: "Ceiling Grid" },
  { value: "ceiling_tile", label: "Ceiling Tile" },
  { value: "metal_angles", label: "Metal/Angles" },
  { value: "insulation", label: "Insulation" },
  { value: "fasteners", label: "Fasteners" },
  { value: "tape_compound", label: "Tape & Compound" },
  { value: "accessories", label: "Accessories" },
  { value: "tools", label: "Tools" },
  { value: "misc", label: "Misc" },
];

export function ManualInvoiceDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  companyId,
}: ManualInvoiceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("");
  const [total, setTotal] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "", category: "misc", quantity: "1", unit: "ea", unitPrice: "", lineAmount: "" },
  ]);

  // Calculate total from subtotal and tax
  const calculateTotal = (sub: string, tx: string) => {
    const subNum = parseFloat(sub) || 0;
    const taxNum = parseFloat(tx) || 0;
    return (subNum + taxNum).toFixed(2);
  };

  // Auto-calculate total when subtotal or tax changes
  const handleSubtotalChange = (value: string) => {
    setSubtotal(value);
    setTotal(calculateTotal(value, tax));
  };

  const handleTaxChange = (value: string) => {
    setTax(value);
    setTotal(calculateTotal(subtotal, value));
  };

  // Line item management
  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        description: "",
        category: "misc",
        quantity: "1",
        unit: "ea",
        unitPrice: "",
        lineAmount: "",
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((item) => item.id !== id));
    }
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // Auto-calculate line amount when quantity or unit price changes
        if (field === "quantity" || field === "unitPrice") {
          const qty = parseFloat(field === "quantity" ? value : item.quantity) || 0;
          const price = parseFloat(field === "unitPrice" ? value : item.unitPrice) || 0;
          updated.lineAmount = (qty * price).toFixed(2);
        }

        return updated;
      })
    );
  };

  // Calculate subtotal from line items
  const calculateSubtotalFromItems = () => {
    const sum = lineItems.reduce((acc, item) => acc + (parseFloat(item.lineAmount) || 0), 0);
    setSubtotal(sum.toFixed(2));
    setTotal(calculateTotal(sum.toFixed(2), tax));
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        companyId,
        vendor: vendor || "Unknown Vendor",
        invoiceNumber: invoiceNumber || null,
        invoiceDate,
        subtotal: parseFloat(subtotal) || 0,
        tax: parseFloat(tax) || 0,
        total: parseFloat(total) || 0,
        lineItems: lineItems
          .filter((item) => item.description.trim())
          .map((item) => ({
            description: item.description,
            category: item.category,
            quantity: parseFloat(item.quantity) || 1,
            unit: item.unit || "ea",
            unitPrice: parseFloat(item.unitPrice) || 0,
            lineAmount: parseFloat(item.lineAmount) || 0,
          })),
      };

      const response = await fetch(`/api/projects/${projectId}/vendor-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save invoice");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invoice saved",
        description: "The invoice has been added successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/materials/summary`] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save invoice",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setVendor("");
    setInvoiceNumber("");
    setInvoiceDate(format(new Date(), "yyyy-MM-dd"));
    setSubtotal("");
    setTax("");
    setTotal("");
    setLineItems([
      { id: "1", description: "", category: "misc", quantity: "1", unit: "ea", unitPrice: "", lineAmount: "" },
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim()) {
      toast({
        title: "Vendor required",
        description: "Please enter a vendor name",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600" />
            Add Invoice Manually
          </DialogTitle>
          <DialogDescription>
            Enter invoice details for {projectName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor *</Label>
              <Input
                id="vendor"
                placeholder="e.g., Home Depot, Lowe's"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Invoice # (optional)</Label>
              <Input
                id="invoiceNumber"
                placeholder="Leave blank if none"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Input value={projectName} disabled className="bg-muted" />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>

            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
              {lineItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 items-start p-3 bg-muted/30 rounded-lg"
                >
                  <div className="col-span-4">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={item.category}
                      onValueChange={(value) => updateLineItem(item.id, "category", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <Input
                      placeholder="Qty"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(item.id, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      placeholder="Unit Price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(item.id, "unitPrice", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      placeholder="Amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.lineAmount}
                      onChange={(e) => updateLineItem(item.id, "lineAmount", e.target.value)}
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLineItem(item.id)}
                      disabled={lineItems.length === 1}
                      className="h-9 w-9"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={calculateSubtotalFromItems}
              className="w-full"
            >
              Calculate Subtotal from Items
            </Button>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="subtotal">Subtotal</Label>
              <Input
                id="subtotal"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={subtotal}
                onChange={(e) => handleSubtotalChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax">Tax</Label>
              <Input
                id="tax"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={tax}
                onChange={(e) => handleTaxChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total">Total *</Label>
              <Input
                id="total"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="font-bold text-lg"
                required
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  Save Invoice
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
