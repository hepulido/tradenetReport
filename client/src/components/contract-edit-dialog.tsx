import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Loader2, Building2, Plus } from "lucide-react";
import { GcCreateDialog } from "@/components/gc-create-dialog";
import type { ProjectWithDetails, GeneralContractor } from "@/lib/types";

interface ContractEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithDetails;
  companyId: string;
  onSuccess?: () => void;
}

export function ContractEditDialog({
  open,
  onOpenChange,
  project,
  companyId,
  onSuccess,
}: ContractEditDialogProps) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    gcId: "",
    address: "",
    initialProposal: "",
    pocName: "",
    pocPhone: "",
    pocEmail: "",
    notes: "",
  });

  const [showGcCreate, setShowGcCreate] = useState(false);

  // Fetch general contractors
  const { data: gcsData, isError: gcsFetchError, error: gcsError } = useQuery<{ ok: boolean; generalContractors: GeneralContractor[] }>({
    queryKey: [`/api/companies/${companyId}/general-contractors`],
    enabled: open && !!companyId,
  });
  const generalContractors = gcsData?.generalContractors || [];

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        gcId: project.gcId || "",
        address: project.address || "",
        initialProposal: project.initialProposal || "",
        pocName: project.pocName || "",
        pocPhone: project.pocPhone || "",
        pocEmail: project.pocEmail || "",
        notes: project.notes || "",
      });
      setShowGcCreate(false);
    }
  }, [open, project]);

  // Update project mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcId: data.gcId || null,
          address: data.address || null,
          initialProposal: data.initialProposal || null,
          pocName: data.pocName || null,
          pocPhone: data.pocPhone || null,
          pocEmail: data.pocEmail || null,
          notes: data.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      onOpenChange(false);
      onSuccess?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleGcCreated = (gc: { id: string; name: string }) => {
    setFormData({ ...formData, gcId: gc.id });
  };

  const formatCurrencyInput = (value: string): string => {
    // Remove non-numeric characters except decimal
    const cleaned = value.replace(/[^\d.]/g, "");
    // Ensure only one decimal point
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      return parts[0] + "." + parts.slice(1).join("");
    }
    return cleaned;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Edit Contract Details</DialogTitle>
          <DialogDescription>
            Update the general contractor, project address, and contract amount.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4">
            {/* General Contractor */}
            <div className="grid gap-2">
              <Label htmlFor="gc">General Contractor</Label>
              <div className="flex gap-2">
                <Select
                  value={formData.gcId || "__none__"}
                  onValueChange={(value) => setFormData({ ...formData, gcId: value === "__none__" ? "" : value })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select general contractor">
                      {formData.gcId ? (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {generalContractors.find((gc) => gc.id === formData.gcId)?.name ||
                            "Select GC"}
                        </div>
                      ) : (
                        "Select general contractor"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No GC assigned</SelectItem>
                    {generalContractors.map((gc) => (
                      <SelectItem key={gc.id} value={gc.id}>
                        {gc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setShowGcCreate(true)}
                  title="Add new GC"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Project Address */}
            <div className="grid gap-2">
              <Label htmlFor="address">Project Address</Label>
              <Textarea
                id="address"
                placeholder="123 Main St, City, State ZIP"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="resize-none"
                rows={2}
              />
            </div>

            {/* Initial Contract Amount */}
            <div className="grid gap-2">
              <Label htmlFor="initialProposal">Contract Amount ($)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="initialProposal"
                  type="text"
                  inputMode="decimal"
                  className="pl-7"
                  placeholder="0.00"
                  value={formData.initialProposal}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      initialProposal: formatCurrencyInput(e.target.value),
                    })
                  }
                />
              </div>
              {formData.initialProposal && (
                <p className="text-xs text-muted-foreground">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(parseFloat(formData.initialProposal) || 0)}
                </p>
              )}
            </div>

            {/* Project Manager Section */}
            <div className="border-t pt-4 mt-2">
              <Label className="text-sm font-medium mb-3 block">Project Manager (for this job)</Label>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="pocName" className="text-xs text-muted-foreground">
                    Name
                  </Label>
                  <Input
                    id="pocName"
                    placeholder="Project Manager name"
                    value={formData.pocName}
                    onChange={(e) => setFormData({ ...formData, pocName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="pocPhone" className="text-xs text-muted-foreground">
                      Phone
                    </Label>
                    <Input
                      id="pocPhone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={formData.pocPhone}
                      onChange={(e) => setFormData({ ...formData, pocPhone: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pocEmail" className="text-xs text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="pocEmail"
                      type="email"
                      placeholder="pm@example.com"
                      value={formData.pocEmail}
                      onChange={(e) => setFormData({ ...formData, pocEmail: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional project notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="resize-none"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>

          {(updateMutation.isError || gcsFetchError) && (
            <p className="text-sm text-red-600 mt-2">
              {updateMutation.error?.message || (gcsError as Error)?.message || "An error occurred"}
            </p>
          )}
        </form>
      </DialogContent>

      {/* GC Create Dialog */}
      <GcCreateDialog
        open={showGcCreate}
        onOpenChange={setShowGcCreate}
        companyId={companyId}
        onSuccess={handleGcCreated}
      />
    </Dialog>
  );
}
