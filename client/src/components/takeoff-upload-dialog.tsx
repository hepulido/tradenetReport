import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Upload, FileSpreadsheet, Loader2, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TakeoffItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  category: string;
  selected: boolean;
  isDuplicate?: boolean;
}

interface ExistingLineItem {
  id: string;
  description: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  unitCost: string | null;
  totalCost: string;
}

interface TakeoffUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  budgetId?: string;
}

const CATEGORIES = [
  { value: "drywall", label: "Drywall" },
  { value: "metal_studs", label: "Metal Studs" },
  { value: "ceiling_grid", label: "Ceiling Grid" },
  { value: "ceiling_tile", label: "Ceiling Tile" },
  { value: "insulation", label: "Insulation" },
  { value: "fasteners", label: "Fasteners" },
  { value: "tape_mud", label: "Tape & Mud" },
  { value: "corner_bead", label: "Corner Bead" },
  { value: "framing", label: "Framing" },
  { value: "accessories", label: "Accessories" },
  { value: "labor", label: "Labor" },
  { value: "misc", label: "Misc" },
];

// Auto-detect category from material name
function detectCategory(name: string): string {
  const nameLower = name.toLowerCase();

  if (nameLower.includes("drywall") || nameLower.includes("sheetrock") || nameLower.includes("gypsum")) {
    return "drywall";
  }
  if (nameLower.includes("stud") || nameLower.includes("track") || nameLower.includes("metal")) {
    return "metal_studs";
  }
  if (nameLower.includes("grid") || nameLower.includes("tee") || nameLower.includes("cross tee") || nameLower.includes("main runner")) {
    return "ceiling_grid";
  }
  if (nameLower.includes("tile") || nameLower.includes("panel") || nameLower.includes("ceiling")) {
    return "ceiling_tile";
  }
  if (nameLower.includes("insulation") || nameLower.includes("batt") || nameLower.includes("r-")) {
    return "insulation";
  }
  if (nameLower.includes("screw") || nameLower.includes("nail") || nameLower.includes("fastener") || nameLower.includes("anchor")) {
    return "fasteners";
  }
  if (nameLower.includes("tape") || nameLower.includes("mud") || nameLower.includes("compound") || nameLower.includes("finish")) {
    return "tape_mud";
  }
  if (nameLower.includes("corner") || nameLower.includes("bead") || nameLower.includes("trim")) {
    return "corner_bead";
  }
  if (nameLower.includes("frame") || nameLower.includes("header") || nameLower.includes("plate")) {
    return "framing";
  }

  return "misc";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

type DuplicateAction = "skip" | "replace" | "add";

export function TakeoffUploadDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  budgetId,
}: TakeoffUploadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<TakeoffItem[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip");

  // Fetch existing line items to check for duplicates
  const { data: existingData } = useQuery<{ ok: boolean; budget: any; lineItems: ExistingLineItem[] }>({
    queryKey: [`/api/budgets/${budgetId}`],
    enabled: !!budgetId && open,
  });
  const existingItems = existingData?.lineItems || [];

  // Check if an item is a duplicate
  const isDuplicate = useCallback((name: string) => {
    const normalizedName = name.toLowerCase().trim();
    return existingItems.some(item =>
      item.description.toLowerCase().trim() === normalizedName
    );
  }, [existingItems]);

  // Count duplicates in current items
  const duplicateCount = useMemo(() => {
    return items.filter(item => item.isDuplicate && item.selected).length;
  }, [items]);

  // Parse Excel file
  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);

      const response = await fetch("/api/parse-takeoff", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to parse file");
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.items && data.items.length > 0) {
        // Add selection state, auto-detect categories, and check for duplicates
        const processedItems = data.items.map((item: any, index: number) => {
          const name = item.name || item.description || "Unknown Item";
          const duplicate = isDuplicate(name);
          return {
            id: String(index),
            name,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || "ea",
            unitCost: parseFloat(item.unitCost) || parseFloat(item.costEach) || 0,
            totalCost: parseFloat(item.totalCost) || parseFloat(item.priceTotal) || 0,
            category: detectCategory(name),
            selected: !duplicate, // Auto-deselect duplicates
            isDuplicate: duplicate,
          };
        });
        setItems(processedItems);
        setStep("preview");
      } else {
        setError("No items found in the file. Please check the format.");
      }
    },
    onError: (error: any) => {
      setError(error.message || "Failed to parse file");
    },
  });

  // Import items to budget
  const importMutation = useMutation({
    mutationFn: async (selectedItems: TakeoffItem[]) => {
      // First ensure budget exists
      let activeBudgetId = budgetId;

      if (!activeBudgetId) {
        const budgetRes = await fetch(`/api/projects/${projectId}/budgets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Material Takeoff",
            contractValue: "0",
          }),
        });

        if (!budgetRes.ok) {
          throw new Error("Failed to create budget");
        }

        const budgetData = await budgetRes.json();
        activeBudgetId = budgetData.budget.id;
      }

      // If replacing duplicates, delete existing items first
      if (duplicateAction === "replace" && existingItems.length > 0) {
        const duplicateNames = selectedItems
          .filter(item => item.isDuplicate)
          .map(item => item.name.toLowerCase().trim());

        for (const existing of existingItems) {
          if (duplicateNames.includes(existing.description.toLowerCase().trim())) {
            await fetch(`/api/budget-line-items/${existing.id}`, { method: "DELETE" });
          }
        }
      }

      // Filter items based on duplicate action
      let itemsToImport = selectedItems;
      if (duplicateAction === "skip") {
        itemsToImport = selectedItems.filter(item => !item.isDuplicate);
      }

      // Import items one by one with progress
      let imported = 0;
      for (const item of itemsToImport) {
        const response = await fetch(`/api/budgets/${activeBudgetId}/line-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: item.category,
            description: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unitCost: item.unitCost.toString(),
            totalCost: item.totalCost.toString(),
          }),
        });

        if (!response.ok) {
          console.warn(`Failed to import item: ${item.name}`);
        }

        imported++;
        setImportProgress(Math.round((imported / itemsToImport.length) * 100));
      }

      return { imported, total: itemsToImport.length, skipped: selectedItems.length - itemsToImport.length };
    },
    onSuccess: (data) => {
      let message = `Successfully imported ${data.imported} of ${data.total} items.`;
      if (data.skipped > 0) {
        message += ` Skipped ${data.skipped} duplicates.`;
      }
      toast({
        title: "Import Complete",
        description: message,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/budgets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/budgets/${budgetId}`] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import items",
        variant: "destructive",
      });
      setStep("preview");
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setFile(file);
      setError(null);
      parseMutation.mutate(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    maxFiles: 1,
  });

  const handleClose = () => {
    setStep("upload");
    setFile(null);
    setItems([]);
    setImportProgress(0);
    setError(null);
    setDuplicateAction("skip");
    onOpenChange(false);
  };

  const toggleItem = (id: string) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const toggleAll = (selected: boolean) => {
    setItems(items.map(item => ({ ...item, selected })));
  };

  const updateCategory = (id: string, category: string) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, category } : item
    ));
  };

  const handleImport = () => {
    const selectedItems = items.filter(item => item.selected);
    if (selectedItems.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one item to import.",
        variant: "destructive",
      });
      return;
    }
    setStep("importing");
    importMutation.mutate(selectedItems);
  };

  const selectedCount = items.filter(i => i.selected).length;
  const totalCost = items.filter(i => i.selected).reduce((sum, i) => sum + i.totalCost, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            Import Material Takeoff
          </DialogTitle>
          <DialogDescription>
            Upload a takeoff spreadsheet for {projectName}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors
                ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
                ${parseMutation.isPending ? "opacity-50 pointer-events-none" : ""}
              `}
            >
              <input {...getInputProps()} />
              {parseMutation.isPending ? (
                <>
                  <Loader2 className="h-10 w-10 mx-auto text-muted-foreground animate-spin" />
                  <p className="mt-2 text-sm text-muted-foreground">Parsing file...</p>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isDragActive ? "Drop the file here" : "Drag & drop a takeoff spreadsheet, or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports Excel (.xlsx, .xls) and CSV files
                  </p>
                </>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {existingItems.length > 0 && (
              <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                <CardContent className="p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p className="font-medium">This project already has {existingItems.length} takeoff items.</p>
                    <p>Duplicate items will be detected and you can choose how to handle them.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {file && !parseMutation.isPending && (
              <div className="p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Selected</p>
                  <p className="text-lg font-bold">{selectedCount} / {items.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(totalCost)}</p>
                </div>
                {duplicateCount > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Duplicates</p>
                    <p className="text-lg font-bold text-amber-600">{duplicateCount}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                  Deselect All
                </Button>
              </div>
            </div>

            {/* Duplicate Handling Options */}
            {duplicateCount > 0 && (
              <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <RefreshCw className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        {duplicateCount} duplicate items detected
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        How should we handle items that already exist?
                      </p>
                    </div>
                  </div>
                  <RadioGroup value={duplicateAction} onValueChange={(v) => setDuplicateAction(v as DuplicateAction)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="skip" id="skip" />
                      <Label htmlFor="skip" className="text-sm font-normal">Skip duplicates (recommended)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="replace" id="replace" />
                      <Label htmlFor="replace" className="text-sm font-normal">Replace existing with new values</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="add" id="add" />
                      <Label htmlFor="add" className="text-sm font-normal">Add anyway (creates duplicates)</Label>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>
            )}

            {/* Items Table */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className={!item.selected ? "opacity-50" : item.isDuplicate ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={() => toggleItem(item.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[250px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{item.name}</span>
                          {item.isDuplicate && (
                            <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300 shrink-0">
                              duplicate
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.category}
                          onValueChange={(val) => updateCategory(item.id, val)}
                        >
                          <SelectTrigger className="w-[140px] h-8">
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
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(item.unitCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(item.totalCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={selectedCount === 0}>
                <Upload className="h-4 w-4 mr-2" />
                Import {selectedCount} Items
                {duplicateAction === "skip" && duplicateCount > 0 && ` (${duplicateCount} skipped)`}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="py-8 space-y-6">
            <div className="text-center">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
              <p className="mt-4 font-medium">Importing takeoff items...</p>
              <p className="text-sm text-muted-foreground">Please wait while we add the items to your budget.</p>
            </div>
            <Progress value={importProgress} className="h-3" />
            <p className="text-center text-sm text-muted-foreground">
              {importProgress}% complete
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
