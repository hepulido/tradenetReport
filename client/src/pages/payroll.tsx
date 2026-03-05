import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Upload,
  Users,
  Calendar,
  DollarSign,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { ExportButton } from "@/components/export-button";
import { EXPORT_COLUMNS } from "@/lib/export";
import { queryClient } from "@/lib/queryClient";
import type { Worker, PayrollEntry, Project } from "@/lib/types";

// ========== Types ==========

interface ParsedPayrollRow {
  empresa: string;
  proyecto: string;
  semana: string;
  workerName: string;
  cargo: string | null;
  dailyRate: number;
  daysWorked: number;
  basePay: number;
  parking: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  deductions: number;
  totalPay: number;
}

interface ParsedEntry {
  row: ParsedPayrollRow;
  workerId: string | null;
  workerName: string;
  projectId: string | null;
  projectName: string;
  isNewWorker: boolean;
  isNewProject: boolean;
}

interface ParseResult {
  ok: boolean;
  weekStart: string;
  weekEnd: string;
  rowCount: number;
  totalPay: number;
  entries: ParsedEntry[];
  warnings: string[];
  unmatchedWorkers: string[];
  unmatchedProjects: string[];
}

interface ImportResult {
  ok: boolean;
  entriesCreated: number;
  totalPay: number;
  weekStart: string;
  weekEnd: string;
  warnings: string[];
  createdWorkers: string[];
  createdProjects: string[];
  skippedEntries: { worker: string; project: string; reason: string }[];
}

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

// ========== Main Component ==========

export default function Payroll() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [createMissingWorkers, setCreateMissingWorkers] = useState(true);
  const [createMissingProjects, setCreateMissingProjects] = useState(true);
  const [replaceExistingWeek, setReplaceExistingWeek] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  // Project mapping: maps new project name to existing project ID
  const [projectMappings, setProjectMappings] = useState<Record<string, string>>({});

  // Queries
  const { data: workersData } = useQuery<{ workers: Worker[] }>({
    queryKey: ["/api/companies", selectedCompany?.id, "workers"],
    enabled: !!selectedCompany,
  });
  const workers = workersData?.workers || [];

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "projects"],
    enabled: !!selectedCompany,
  });

  const { data: payrollData, isLoading: entriesLoading } = useQuery<{ entries: PayrollEntry[] }>({
    queryKey: ["/api/companies", selectedCompany?.id, "payroll"],
    enabled: !!selectedCompany,
  });
  const payrollEntries = payrollData?.entries || [];

  // Handlers
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCompany) return;

    setIsParsing(true);
    setParseResult(null);
    setProjectMappings({});

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/companies/${selectedCompany.id}/payroll/parse-excel`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to parse file");
      }

      const result = await response.json();
      setParseResult(result);
      setShowUploadDialog(true);
    } catch (error) {
      toast({
        title: "Parse Error",
        description: "Failed to parse the Excel file. Please check the format.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImport = async () => {
    if (!parseResult || !selectedCompany) return;

    setIsImporting(true);

    try {
      const response = await fetch(
        `/api/companies/${selectedCompany.id}/payroll/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            weekStart: parseResult.weekStart,
            weekEnd: parseResult.weekEnd,
            entries: parseResult.entries,
            createMissingWorkers,
            createMissingProjects,
            replaceExistingWeek,
            projectMappings,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to import payroll");
      }

      const result: ImportResult = await response.json();

      if (result.ok) {
        toast({
          title: "Import Successful",
          description: `Created ${result.entriesCreated} payroll entries totaling ${formatCurrency(result.totalPay)}`,
        });

        queryClient.invalidateQueries({
          queryKey: ["/api/companies", selectedCompany.id, "payroll"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/companies", selectedCompany.id, "workers"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/companies", selectedCompany.id, "projects"],
        });

        setShowUploadDialog(false);
        setParseResult(null);
        setProjectMappings({});
      } else {
        const errorMsg = result.skippedEntries?.length > 0
          ? `${result.skippedEntries.length} entries skipped`
          : "Unknown error";
        toast({
          title: "Import Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import Error",
        description: "Failed to import payroll data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleWeekExpanded = (weekStart: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
  };

  // Group entries by week
  const entriesByWeek = (payrollEntries || []).reduce((acc, entry) => {
    const key = entry.weekStart;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, PayrollEntry[]>);

  const weekKeys = Object.keys(entriesByWeek).sort().reverse();
  const workerMap = new Map((workers || []).map((w) => [w.id, w]));
  const projectMap = new Map((projects || []).map((p) => [p.id, p]));

  // Totals
  const totalPayroll = (payrollEntries || []).reduce(
    (sum, e) => sum + parseFloat(e.totalPay),
    0
  );
  const totalWorkers = new Set((payrollEntries || []).map((e) => e.workerId)).size;

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={Users}
          title="No Company Selected"
          description="Please select or create a company to view payroll."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Payroll</h1>
          <p className="text-muted-foreground mt-1">
            Weekly payroll management for {selectedCompany.name}
          </p>
        </div>
        <div className="flex gap-2">
          {payrollEntries.length > 0 && (
            <ExportButton
              data={payrollEntries.map((e) => ({
                ...e,
                workerName: workerMap.get(e.workerId)?.name || "Unknown",
                projectName: projectMap.get(e.projectId)?.name || "Unknown",
              }))}
              filename={`payroll-${selectedCompany.name}`}
              columns={EXPORT_COLUMNS.payroll}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing}
          >
            {isParsing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import Excel
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(totalPayroll)}
            </div>
            <p className="text-xs text-muted-foreground">
              across {weekKeys.length} weeks
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{totalWorkers}</div>
            <p className="text-xs text-muted-foreground">
              unique workers paid
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entries</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {(payrollEntries || []).length}
            </div>
            <p className="text-xs text-muted-foreground">
              payroll entries
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payroll by Week */}
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
      ) : weekKeys.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No Payroll Data"
          description="Import your first payroll Excel file to get started."
          action={{
            label: "Import Excel",
            onClick: () => fileInputRef.current?.click(),
          }}
        />
      ) : (
        <div className="space-y-4">
          {weekKeys.map((weekStart) => {
            const entries = entriesByWeek[weekStart];
            const weekEnd = entries[0]?.weekEnd || weekStart;
            const weekTotal = entries.reduce(
              (sum, e) => sum + parseFloat(e.totalPay),
              0
            );
            const weekDays = entries.reduce(
              (sum, e) => sum + parseFloat(e.daysWorked),
              0
            );
            const isExpanded = expandedWeeks.has(weekStart);

            // Group by project
            const byProject = entries.reduce((acc, entry) => {
              const key = entry.projectId;
              if (!acc[key]) acc[key] = [];
              acc[key].push(entry);
              return acc;
            }, {} as Record<string, PayrollEntry[]>);

            return (
              <Collapsible
                key={weekStart}
                open={isExpanded}
                onOpenChange={() => toggleWeekExpanded(weekStart)}
              >
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <CardTitle className="text-base">
                              Week of {format(new Date(weekStart), "MMM d")} -{" "}
                              {format(new Date(weekEnd), "MMM d, yyyy")}
                            </CardTitle>
                            <CardDescription>
                              {entries.length} workers | {weekDays} days worked |{" "}
                              {Object.keys(byProject).length} projects
                            </CardDescription>
                          </div>
                        </div>
                        <Badge className="text-base font-mono">
                          {formatCurrency(weekTotal)}
                        </Badge>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-4">
                        {Object.entries(byProject).map(([projectId, projectEntries]) => {
                          const project = projectMap.get(projectId);
                          const projectTotal = projectEntries.reduce(
                            (sum, e) => sum + parseFloat(e.totalPay),
                            0
                          );

                          return (
                            <div key={projectId} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium">
                                  {project?.name || "Unknown Project"}
                                </h4>
                                <Badge variant="outline">
                                  {formatCurrency(projectTotal)}
                                </Badge>
                              </div>
                              <div className="overflow-x-auto -mx-4 px-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Worker</TableHead>
                                      <TableHead className="text-right">Days</TableHead>
                                      <TableHead className="text-right">Daily Rate</TableHead>
                                      <TableHead className="text-right">Base Pay</TableHead>
                                      <TableHead className="text-right">Extras</TableHead>
                                      <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {projectEntries.map((entry) => {
                                      const worker = workerMap.get(entry.workerId);
                                      const parking = parseFloat(entry.parking || "0");
                                      const bonus = parseFloat(entry.bonus || "0");
                                      const extras = parking + bonus;

                                      return (
                                        <TableRow key={entry.id}>
                                          <TableCell className="font-medium">
                                            {worker?.name || "Unknown"}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            {entry.daysWorked}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            {formatCurrency(entry.dailyRate)}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            {formatCurrency(entry.basePay)}
                                          </TableCell>
                                          <TableCell className="text-right font-mono text-muted-foreground">
                                            {extras > 0 ? `+${formatCurrency(extras)}` : "—"}
                                          </TableCell>
                                          <TableCell className="text-right font-mono font-semibold">
                                            {formatCurrency(entry.totalPay)}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
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

      {/* Import Preview Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Payroll Preview
            </DialogTitle>
            <DialogDescription>
              Review the parsed data before importing
            </DialogDescription>
          </DialogHeader>

          {parseResult && parseResult.entries && (
            <div className="space-y-4">
              {/* Week Info */}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  Week: {parseResult.weekStart && format(new Date(parseResult.weekStart), "MMM d")} -{" "}
                  {parseResult.weekEnd && format(new Date(parseResult.weekEnd), "MMM d, yyyy")}
                </span>
                <Badge variant="secondary">{parseResult.entries?.length || 0} entries</Badge>
                <Badge className="font-mono">
                  {formatCurrency(parseResult.totalPay || 0)}
                </Badge>
              </div>

              {/* Warnings */}
              {(parseResult.warnings?.length || 0) > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 text-sm">
                      {(parseResult.warnings || []).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}


              {/* Preview Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worker</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(parseResult.entries || []).slice(0, 20).map((entry, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {entry.workerName}
                            {entry.isNewWorker && <span className="ml-1 text-xs text-blue-500">(new)</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.projectName}
                            {entry.isNewProject && <span className="ml-1 text-xs text-amber-500">(new)</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.row.daysWorked || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.row.dailyRate ? formatCurrency(entry.row.dailyRate) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(entry.row.totalPay)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {(parseResult.entries?.length || 0) > 20 && (
                  <div className="p-2 text-center text-sm text-muted-foreground bg-muted/50">
                    ...and {(parseResult.entries?.length || 0) - 20} more entries
                  </div>
                )}
              </div>

              <Separator />

              {/* New Projects Section */}
              {(parseResult.unmatchedProjects?.length || 0) > 0 && (() => {
                const mappedCount = parseResult.unmatchedProjects.filter(p => projectMappings[p] && projectMappings[p] !== "__create__" && projectMappings[p] !== "__skip__").length;
                const skippedCount = parseResult.unmatchedProjects.filter(p => projectMappings[p] === "__skip__").length;
                const willCreateCount = parseResult.unmatchedProjects.length - mappedCount - skippedCount;

                // Count entries that will be skipped
                const skippedProjects = parseResult.unmatchedProjects.filter(p => projectMappings[p] === "__skip__");
                const skippedEntriesCount = parseResult.entries?.filter(e => skippedProjects.includes(e.projectName))?.length || 0;

                return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h4 className="font-medium">New Projects Found</h4>
                    <Badge variant="secondary">{parseResult.unmatchedProjects.length}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {willCreateCount > 0 && <>{willCreateCount} will be created. </>}
                    {mappedCount > 0 && <>{mappedCount} mapped to existing. </>}
                    {skippedCount > 0 && (
                      <span className="text-red-600">
                        {skippedCount} skipped ({skippedEntriesCount} payroll entries won't be imported).
                      </span>
                    )}
                    {willCreateCount === parseResult.unmatchedProjects.length && (
                      <>Choose what to do with each project below.</>
                    )}
                  </p>
                  <div className="border rounded-lg divide-y">
                    {parseResult.unmatchedProjects.map((newProject) => {
                      const mapping = projectMappings[newProject];
                      const isSkipped = mapping === "__skip__";
                      const isMapped = mapping && mapping !== "__create__" && mapping !== "__skip__";

                      return (
                      <div key={newProject} className={cn(
                        "p-3 flex items-center justify-between gap-4",
                        isSkipped && "bg-red-50 opacity-60"
                      )}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className={cn(
                            "shrink-0",
                            isSkipped ? "bg-red-100 text-red-700 line-through" :
                            isMapped ? "bg-emerald-50 text-emerald-700" :
                            "bg-amber-50 text-amber-700"
                          )}>
                            {isSkipped ? "Skip" : isMapped ? "Map" : "New"}
                          </Badge>
                          <span className={cn("font-medium truncate", isSkipped && "line-through")}>{newProject}</span>
                        </div>
                        <Select
                          value={projectMappings[newProject] || "__create__"}
                          onValueChange={(value) =>
                            setProjectMappings((prev) => ({
                              ...prev,
                              [newProject]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Create as new" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__create__">Create as new project</SelectItem>
                            <SelectItem value="__skip__" className="text-red-600">
                              Skip (don't import)
                            </SelectItem>
                            {(projects || []).length > 0 && (
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                Map to existing:
                              </div>
                            )}
                            {(projects || []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );})}
                  </div>
                </div>
                );
              })()}

              <Separator />

              {/* Import Options */}
              <div className="space-y-3">
                <h4 className="font-medium">Import Options</h4>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="createWorkers"
                    checked={createMissingWorkers}
                    onCheckedChange={(checked) =>
                      setCreateMissingWorkers(checked as boolean)
                    }
                  />
                  <label
                    htmlFor="createWorkers"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Create new workers automatically
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="createProjects"
                    checked={createMissingProjects}
                    onCheckedChange={(checked) =>
                      setCreateMissingProjects(checked as boolean)
                    }
                  />
                  <label
                    htmlFor="createProjects"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Create unmapped projects automatically
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="replaceWeek"
                    checked={replaceExistingWeek}
                    onCheckedChange={(checked) =>
                      setReplaceExistingWeek(checked as boolean)
                    }
                  />
                  <label
                    htmlFor="replaceWeek"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Replace existing entries for this week
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false);
                setParseResult(null);
              }}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                isImporting ||
                !parseResult ||
                !parseResult.entries ||
                (parseResult.entries?.length || 0) === 0
              }
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Import {parseResult?.entries?.length || 0} Entries
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
