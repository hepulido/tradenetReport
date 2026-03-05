import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { BudgetLineItem } from "@/lib/types";

// Common material categories for drywall/construction
const MATERIAL_CATEGORIES = [
  { value: "metal_studs", label: "Metal Studs" },
  { value: "drywall", label: "Drywall / Sheetrock" },
  { value: "ceiling_grid", label: "Ceiling Grid" },
  { value: "ceiling_tile", label: "Ceiling Tile" },
  { value: "insulation", label: "Insulation" },
  { value: "fasteners", label: "Fasteners / Screws" },
  { value: "tape_mud", label: "Tape & Mud" },
  { value: "corner_bead", label: "Corner Bead / Trim" },
  { value: "framing", label: "Framing Materials" },
  { value: "labor", label: "Labor" },
  { value: "equipment", label: "Equipment Rental" },
  { value: "misc", label: "Miscellaneous" },
];

// Common units
const UNITS = [
  { value: "EA", label: "Each (EA)" },
  { value: "LF", label: "Linear Feet (LF)" },
  { value: "SF", label: "Square Feet (SF)" },
  { value: "SH", label: "Sheets (SH)" },
  { value: "BX", label: "Boxes (BX)" },
  { value: "BAG", label: "Bags" },
  { value: "GAL", label: "Gallons" },
  { value: "HR", label: "Hours" },
  { value: "DAY", label: "Days" },
];

interface TakeoffItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  projectId: string;
  editItem?: BudgetLineItem | null;
  onSuccess?: () => void;
}

export function TakeoffItemDialog({
  open,
  onOpenChange,
  budgetId,
  projectId,
  editItem,
  onSuccess,
}: TakeoffItemDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!editItem;

  const [formData, setFormData] = useState({
    category: "misc",
    description: "",
    quantity: "",
    unit: "EA",
    unitCost: "",
    notes: "",
  });

  // Reset form when dialog opens or editItem changes
  useEffect(() => {
    if (open) {
      if (editItem) {
        setFormData({
          category: editItem.category || "misc",
          description: editItem.description || "",
          quantity: editItem.quantity || "",
          unit: editItem.unit || "EA",
          unitCost: editItem.unitCost || "",
          notes: editItem.notes || "",
        });
      } else {
        setFormData({
          category: "misc",
          description: "",
          quantity: "",
          unit: "EA",
          unitCost: "",
          notes: "",
        });
      }
    }
  }, [open, editItem]);

  // Calculate total cost
  const qty = parseFloat(formData.quantity) || 0;
  const unitCost = parseFloat(formData.unitCost) || 0;
  const totalCost = qty * unitCost;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/budgets/${budgetId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          totalCost: totalCost.toString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/budgets/${budgetId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/budgets`] });
      onOpenChange(false);
      onSuccess?.();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/budget-line-items/${editItem!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          totalCost: totalCost.toString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/budgets/${budgetId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/budgets`] });
      onOpenChange(false);
      onSuccess?.();
    },
  });

  const mutation = isEditing ? updateMutation : createMutation;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) return;
    mutation.mutate(formData);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Takeoff Item" : "Add Takeoff Item"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the material or cost item details."
              : "Add a new material or cost item to the project takeoff."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4">
            {/* Category */}
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="e.g., 5/8 Type X Drywall 4x12"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="resize-none"
                rows={2}
              />
            </div>

            {/* Quantity & Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData({ ...formData, unit: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Unit Cost */}
            <div className="grid gap-2">
              <Label htmlFor="unitCost">Unit Cost ($)</Label>
              <Input
                id="unitCost"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.unitCost}
                onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
              />
            </div>

            {/* Total Cost (calculated) */}
            <div className="grid gap-2">
              <Label>Total Cost</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50 font-medium">
                {formatCurrency(totalCost)}
              </div>
              {qty > 0 && unitCost > 0 && (
                <p className="text-xs text-muted-foreground">
                  {qty} {formData.unit} x {formatCurrency(unitCost)} = {formatCurrency(totalCost)}
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !formData.description.trim()}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>

          {mutation.isError && (
            <p className="text-sm text-red-600 mt-2">
              {mutation.error?.message || "An error occurred"}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
