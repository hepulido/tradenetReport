import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Clock, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LaborEntry, Project } from "@/lib/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

const laborFormSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  workerName: z.string().min(1, "Worker name is required"),
  role: z.string().optional(),
  hours: z.string().min(1, "Hours is required"),
  rate: z.string().optional(),
  laborDate: z.string().min(1, "Date is required"),
});

type LaborFormValues = z.infer<typeof laborFormSchema>;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function Labor() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const form = useForm<LaborFormValues>({
    resolver: zodResolver(laborFormSchema),
    defaultValues: {
      projectId: "",
      workerName: "",
      role: "",
      hours: "",
      rate: "",
      laborDate: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const { data: laborEntries, isLoading: entriesLoading } = useQuery<LaborEntry[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "labor"],
    enabled: !!selectedCompany,
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "projects"],
    enabled: !!selectedCompany,
  });

  const createMutation = useMutation({
    mutationFn: async (data: LaborFormValues) => {
      return await apiRequest("POST", `/api/companies/${selectedCompany!.id}/labor`, {
        ...data,
        source: "manual",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "labor"],
      });
      setShowCreateDialog(false);
      form.reset();
      toast({
        title: "Labor Entry Added",
        description: "The labor entry has been recorded successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add labor entry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LaborFormValues) => {
    createMutation.mutate(data);
  };

  const filteredEntries = laborEntries?.filter((entry) => {
    const workerName = entry.workerName || "";
    const role = entry.role || "";
    const matchesSearch =
      workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = projectFilter === "all" || entry.projectId === projectFilter;
    return matchesSearch && matchesProject;
  });

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "Unassigned";
    const project = projects?.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  const totalHours = filteredEntries?.reduce((sum, e) => {
    const hours = parseFloat(e.hours ?? "0");
    return sum + (isNaN(hours) ? 0 : hours);
  }, 0) || 0;
  const totalCost = filteredEntries?.reduce((sum, e) => {
    const hours = parseFloat(e.hours ?? "0");
    const rate = parseFloat(e.rate ?? "0");
    const cost = (isNaN(hours) ? 0 : hours) * (isNaN(rate) ? 0 : rate);
    return sum + cost;
  }, 0) || 0;

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={Clock}
          title="No Company Selected"
          description="Please select or create a company to view labor hours."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-labor-title">Labor Hours</h1>
          <p className="text-muted-foreground mt-1">
            Track worker hours for {selectedCompany.name}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-labor">
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono" data-testid="text-total-hours">
              {totalHours.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">hours tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Labor Cost</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono" data-testid="text-total-cost">
              {formatCurrency(totalCost)}
            </div>
            <p className="text-xs text-muted-foreground">calculated from rates</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by worker or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-labor"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-full sm:w-[220px]" data-testid="select-project-filter">
            <SelectValue placeholder="Filter by project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects?.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entriesLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          </CardContent>
        </Card>
      ) : filteredEntries && filteredEntries.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => {
                  const hoursRaw = parseFloat(entry.hours ?? "0");
                  const rateRaw = parseFloat(entry.rate ?? "0");
                  const hours = isNaN(hoursRaw) ? 0 : hoursRaw;
                  const rate = isNaN(rateRaw) ? 0 : rateRaw;
                  const cost = hours * rate;
                  return (
                    <TableRow key={entry.id} data-testid={`row-labor-${entry.id}`}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(entry.laborDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">{entry.workerName || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.role || "—"}</TableCell>
                      <TableCell>{getProjectName(entry.projectId)}</TableCell>
                      <TableCell className="text-right font-mono">{hours.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {rate > 0 ? formatCurrency(rate) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {rate > 0 ? formatCurrency(cost) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Clock}
          title="No Labor Entries Found"
          description={
            searchQuery || projectFilter !== "all"
              ? "No entries match your search criteria. Try adjusting your filters."
              : "Start tracking worker hours by adding your first labor entry."
          }
          action={
            !searchQuery && projectFilter === "all"
              ? {
                  label: "Add Labor Entry",
                  onClick: () => setShowCreateDialog(true),
                }
              : undefined
          }
        />
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Labor Entry</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Worker Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., John Smith" {...field} data-testid="input-worker-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Electrician" {...field} data-testid="input-role" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hours</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.5" placeholder="8" {...field} data-testid="input-hours" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate ($/hr)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="45.00" {...field} data-testid="input-rate" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="laborDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-labor-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-labor">
                  {createMutation.isPending ? "Adding..." : "Add Entry"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
