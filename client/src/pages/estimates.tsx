import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  ArrowRight,
  DollarSign,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { EmptyState } from "@/components/empty-state";
import { ExportButton } from "@/components/export-button";
import type { Estimate, GeneralContractor } from "@/lib/types";

const formatCurrency = (value: string | number | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "draft":
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Draft</Badge>;
    case "sent":
      return <Badge variant="secondary"><Send className="h-3 w-3 mr-1" />Sent</Badge>;
    case "viewed":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Eye className="h-3 w-3 mr-1" />Viewed</Badge>;
    case "accepted":
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
    case "rejected":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    case "expired":
      return <Badge variant="outline" className="text-red-600"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function Estimates() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    estimateNumber: "",
    name: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    projectAddress: "",
    scopeOfWork: "",
    totalAmount: "",
    estimateDate: format(new Date(), "yyyy-MM-dd"),
    validUntil: "",
    paymentTerms: "",
    notes: "",
  });

  // Fetch estimates
  const { data: estimatesData, isLoading } = useQuery<{ ok: boolean; estimates: Estimate[] }>({
    queryKey: ["/api/companies", selectedCompany?.id, "estimates"],
    enabled: !!selectedCompany,
  });
  const estimates = estimatesData?.estimates || [];

  // Fetch GCs for dropdown
  const { data: gcsData } = useQuery<{ ok: boolean; generalContractors: GeneralContractor[] }>({
    queryKey: ["/api/companies", selectedCompany?.id, "general-contractors"],
    enabled: !!selectedCompany,
  });
  const gcs = gcsData?.generalContractors || [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/companies/${selectedCompany?.id}/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create estimate");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Estimate created" });
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "estimates"],
      });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create estimate", variant: "destructive" });
    },
  });

  // Send mutation
  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/estimates/${id}/send`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to send estimate");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Estimate sent" });
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "estimates"],
      });
    },
  });

  // Convert to project mutation
  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/estimates/${id}/convert-to-project`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to convert estimate");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Project created", description: `Project "${data.project.name}" has been created` });
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "estimates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "projects"],
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/estimates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete estimate");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Estimate deleted" });
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "estimates"],
      });
    },
  });

  const resetForm = () => {
    setFormData({
      estimateNumber: "",
      name: "",
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      projectAddress: "",
      scopeOfWork: "",
      totalAmount: "",
      estimateDate: format(new Date(), "yyyy-MM-dd"),
      validUntil: "",
      paymentTerms: "",
      notes: "",
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.totalAmount) {
      toast({ title: "Error", description: "Name and amount are required", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  // Calculate stats
  const totalEstimates = estimates.length;
  const totalValue = estimates.reduce((sum, e) => sum + parseFloat(e.totalAmount || "0"), 0);
  const acceptedCount = estimates.filter(e => e.status === "accepted").length;
  const pendingCount = estimates.filter(e => ["draft", "sent", "viewed"].includes(e.status)).length;

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={FileText}
          title="No Company Selected"
          description="Please select or create a company to view estimates."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Estimates & Proposals</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage quotes for potential projects
          </p>
        </div>
        <div className="flex gap-2">
          {estimates.length > 0 && (
            <ExportButton
              data={estimates}
              filename={`estimates-${selectedCompany.name}`}
              columns={[
                { key: "estimateNumber", label: "Estimate #" },
                { key: "name", label: "Project Name" },
                { key: "clientName", label: "Client" },
                { key: "totalAmount", label: "Amount" },
                { key: "status", label: "Status" },
                { key: "estimateDate", label: "Date" },
              ]}
            />
          )}
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Estimate
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Estimates</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEstimates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{acceptedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Estimates List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : estimates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 font-semibold">No estimates yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first estimate to start winning more jobs.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Create Estimate
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estimate #</TableHead>
                <TableHead>Project / Client</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimates.map((estimate) => (
                <TableRow key={estimate.id}>
                  <TableCell className="font-medium">
                    {estimate.estimateNumber}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{estimate.name}</p>
                      {estimate.clientName && (
                        <p className="text-sm text-muted-foreground">{estimate.clientName}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(estimate.totalAmount)}
                  </TableCell>
                  <TableCell>
                    {format(new Date(estimate.estimateDate), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(estimate.status)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedEstimate(estimate)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {estimate.status === "draft" && (
                          <DropdownMenuItem onClick={() => sendMutation.mutate(estimate.id)}>
                            <Send className="h-4 w-4 mr-2" />
                            Mark as Sent
                          </DropdownMenuItem>
                        )}
                        {["sent", "viewed"].includes(estimate.status) && (
                          <DropdownMenuItem onClick={() => convertMutation.mutate(estimate.id)}>
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Convert to Project
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => deleteMutation.mutate(estimate.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Estimate Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Estimate</DialogTitle>
            <DialogDescription>
              Create a new estimate or proposal to send to a potential client.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estimateNumber">Estimate Number</Label>
                <Input
                  id="estimateNumber"
                  placeholder="EST-001"
                  value={formData.estimateNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimateNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalAmount">Total Amount *</Label>
                <Input
                  id="totalAmount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, totalAmount: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                placeholder="Kitchen Renovation - Smith Residence"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input
                  id="clientName"
                  placeholder="John Smith"
                  value={formData.clientName}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientEmail">Client Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.clientEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectAddress">Project Address</Label>
              <Input
                id="projectAddress"
                placeholder="123 Main St, Miami, FL 33101"
                value={formData.projectAddress}
                onChange={(e) => setFormData(prev => ({ ...prev, projectAddress: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scopeOfWork">Scope of Work</Label>
              <Textarea
                id="scopeOfWork"
                placeholder="Detailed description of work to be performed..."
                rows={3}
                value={formData.scopeOfWork}
                onChange={(e) => setFormData(prev => ({ ...prev, scopeOfWork: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estimateDate">Estimate Date</Label>
                <Input
                  id="estimateDate"
                  type="date"
                  value={formData.estimateDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimateDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validUntil">Valid Until</Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData(prev => ({ ...prev, validUntil: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes..."
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Estimate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Estimate Dialog */}
      <Dialog open={!!selectedEstimate} onOpenChange={(open) => !open && setSelectedEstimate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Estimate #{selectedEstimate?.estimateNumber}</DialogTitle>
          </DialogHeader>
          {selectedEstimate && (
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{selectedEstimate.name}</h3>
                  {selectedEstimate.clientName && (
                    <p className="text-muted-foreground">{selectedEstimate.clientName}</p>
                  )}
                </div>
                {getStatusBadge(selectedEstimate.status)}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="text-2xl font-bold">{formatCurrency(selectedEstimate.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(selectedEstimate.estimateDate), "MMM d, yyyy")}</p>
                </div>
              </div>

              {selectedEstimate.projectAddress && (
                <div>
                  <p className="text-sm text-muted-foreground">Project Address</p>
                  <p>{selectedEstimate.projectAddress}</p>
                </div>
              )}

              {selectedEstimate.scopeOfWork && (
                <div>
                  <p className="text-sm text-muted-foreground">Scope of Work</p>
                  <p className="text-sm">{selectedEstimate.scopeOfWork}</p>
                </div>
              )}

              {selectedEstimate.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedEstimate.notes}</p>
                </div>
              )}

              <div className="flex justify-between pt-4 border-t">
                {selectedEstimate.status === "draft" && (
                  <Button onClick={() => {
                    sendMutation.mutate(selectedEstimate.id);
                    setSelectedEstimate(null);
                  }}>
                    <Send className="h-4 w-4 mr-2" />
                    Mark as Sent
                  </Button>
                )}
                {["sent", "viewed"].includes(selectedEstimate.status) && (
                  <Button onClick={() => {
                    convertMutation.mutate(selectedEstimate.id);
                    setSelectedEstimate(null);
                  }}>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Convert to Project
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedEstimate(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
