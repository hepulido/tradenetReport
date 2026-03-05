import { useState } from "react";
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
import { Loader2 } from "lucide-react";

interface GcCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSuccess?: (gc: { id: string; name: string }) => void;
}

export function GcCreateDialog({
  open,
  onOpenChange,
  companyId,
  onSuccess,
}: GcCreateDialogProps) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    paymentTermsDays: "45",
    invoiceDueDay: "",
    billingMethod: "",
    retentionPercent: "10",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      contactName: "",
      phone: "",
      email: "",
      address: "",
      paymentTermsDays: "45",
      invoiceDueDay: "",
      billingMethod: "",
      retentionPercent: "10",
      notes: "",
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/companies/${companyId}/general-contractors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          contactName: data.contactName || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          paymentTermsDays: data.paymentTermsDays || "45",
          invoiceDueDay: data.invoiceDueDay || null,
          billingMethod: data.billingMethod || null,
          retentionPercent: data.retentionPercent || "10",
          notes: data.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create GC");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/general-contractors`] });
      onOpenChange(false);
      resetForm();
      onSuccess?.(data.generalContractor);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      createMutation.mutate(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add General Contractor</DialogTitle>
          <DialogDescription>
            Add a new GC to your company. You can assign them to projects later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gcName">Company Name *</Label>
              <Input
                id="gcName"
                placeholder="CH Construction, Dickinson Cameron, etc."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contactName">Contact Name</Label>
                <Input
                  id="contactName"
                  placeholder="John Smith"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gcPhone">Phone</Label>
                <Input
                  id="gcPhone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="gcEmail">Email</Label>
              <Input
                id="gcEmail"
                type="email"
                placeholder="billing@gccompany.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="gcAddress">Address</Label>
              <Textarea
                id="gcAddress"
                placeholder="123 Main St, City, State ZIP"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Payment Terms */}
          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-3 block">Payment Terms</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="paymentTerms" className="text-xs text-muted-foreground">
                  Net Days
                </Label>
                <Input
                  id="paymentTerms"
                  type="number"
                  placeholder="45"
                  value={formData.paymentTermsDays}
                  onChange={(e) => setFormData({ ...formData, paymentTermsDays: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invoiceDueDay" className="text-xs text-muted-foreground">
                  Invoice Due Day
                </Label>
                <Input
                  id="invoiceDueDay"
                  placeholder="Before 25th of month"
                  value={formData.invoiceDueDay}
                  onChange={(e) => setFormData({ ...formData, invoiceDueDay: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="billingMethod" className="text-xs text-muted-foreground">
                  Billing Method
                </Label>
                <Input
                  id="billingMethod"
                  placeholder="AIA, Email, Portal"
                  value={formData.billingMethod}
                  onChange={(e) => setFormData({ ...formData, billingMethod: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="retention" className="text-xs text-muted-foreground">
                  Retention %
                </Label>
                <Input
                  id="retention"
                  type="number"
                  placeholder="10"
                  value={formData.retentionPercent}
                  onChange={(e) => setFormData({ ...formData, retentionPercent: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="gcNotes">Notes</Label>
            <Textarea
              id="gcNotes"
              placeholder="Additional notes about this GC..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="resize-none"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !formData.name.trim()}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create GC
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
