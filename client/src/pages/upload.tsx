import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload as UploadIcon, CheckCircle, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { FileUpload } from "@/components/file-upload";
import { EmptyState } from "@/components/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@/lib/types";

type UploadStep = "upload" | "preview" | "mapping" | "complete";

interface ParsedRow {
  [key: string]: string;
}

export default function Upload() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [step, setStep] = useState<UploadStep>("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "projects"],
    enabled: !!selectedCompany,
  });

  const importMutation = useMutation({
    mutationFn: async (data: { rows: ParsedRow[]; mapping: Record<string, string> }) => {
      return await apiRequest("POST", `/api/companies/${selectedCompany!.id}/import`, data);
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "transactions"],
      });
      setStep("complete");
      toast({
        title: "Import Complete",
        description: `Successfully imported ${result.imported || parsedData.length} transactions.`,
      });
    },
    onError: () => {
      toast({
        title: "Import Failed",
        description: "There was an error importing the data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (file: File) => {
    setUploadedFile(file);
    setIsUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 100);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());
      
      if (lines.length < 2) {
        throw new Error("CSV file must have at least a header row and one data row");
      }

      const csvHeaders = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const rows: ParsedRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const row: ParsedRow = {};
        csvHeaders.forEach((header, index) => {
          row[header] = values[index] || "";
        });
        rows.push(row);
      }

      setHeaders(csvHeaders);
      setParsedData(rows);

      const autoMapping: Record<string, string> = {};
      const mappingHints: Record<string, string[]> = {
        date: ["date", "txn_date", "transaction_date", "txndate"],
        amount: ["amount", "total", "value", "sum"],
        description: ["description", "desc", "memo", "note", "details"],
        vendor: ["vendor", "payee", "supplier", "from"],
        category: ["category", "type", "cat", "classification"],
        project: ["project", "job", "project_name", "job_name"],
      };

      csvHeaders.forEach((header) => {
        const lowerHeader = header.toLowerCase();
        for (const [field, hints] of Object.entries(mappingHints)) {
          if (hints.some((hint) => lowerHeader.includes(hint))) {
            autoMapping[header] = field;
            break;
          }
        }
      });

      setColumnMapping(autoMapping);
      clearInterval(progressInterval);
      setUploadProgress(100);

      setTimeout(() => {
        setStep("preview");
        setIsUploading(false);
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      setIsUploading(false);
      toast({
        title: "Parse Error",
        description: "Failed to parse CSV file. Please check the format.",
        variant: "destructive",
      });
    }
  };

  const handleMappingChange = (csvColumn: string, field: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [csvColumn]: field === "skip" ? "" : field,
    }));
  };

  const handleImport = () => {
    importMutation.mutate({
      rows: parsedData,
      mapping: columnMapping,
    });
  };

  const resetUpload = () => {
    setStep("upload");
    setUploadedFile(null);
    setParsedData([]);
    setHeaders([]);
    setColumnMapping({});
    setUploadProgress(0);
  };

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={UploadIcon}
          title="No Company Selected"
          description="Please select or create a company to upload transactions."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-upload-title">Upload Transactions</h1>
        <p className="text-muted-foreground mt-1">
          Import transactions from a CSV file
        </p>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {["upload", "preview", "mapping", "complete"].map((s, index) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : index < ["upload", "preview", "mapping", "complete"].indexOf(step)
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {index < ["upload", "preview", "mapping", "complete"].indexOf(step) ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            {index < 3 && (
              <div className={`w-12 h-0.5 ${
                index < ["upload", "preview", "mapping", "complete"].indexOf(step)
                  ? "bg-emerald-500"
                  : "bg-muted"
              }`} />
            )}
          </div>
        ))}
      </div>

      {step === "upload" && (
        <FileUpload
          onFileSelect={handleFileSelect}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          uploadStatus={isUploading ? "uploading" : "idle"}
        />
      )}

      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle>Preview Data</CardTitle>
            <CardDescription>
              Review the first 5 rows of your CSV file before proceeding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 5).map((row, index) => (
                    <TableRow key={index}>
                      {headers.map((header) => (
                        <TableCell key={header} className="max-w-[200px] truncate">
                          {row[header]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            <p className="text-sm text-muted-foreground mt-4">
              Showing {Math.min(5, parsedData.length)} of {parsedData.length} rows
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={resetUpload}>
                Start Over
              </Button>
              <Button onClick={() => setStep("mapping")} data-testid="button-continue-mapping">
                Continue to Mapping
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Map your CSV columns to transaction fields. We've auto-detected some mappings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-4">
                  <div className="w-1/3">
                    <p className="text-sm font-medium">{header}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      e.g., {parsedData[0]?.[header] || "-"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={columnMapping[header] || "skip"}
                    onValueChange={(value) => handleMappingChange(header, value)}
                  >
                    <SelectTrigger className="w-1/2" data-testid={`select-mapping-${header}`}>
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip this column</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="amount">Amount</SelectItem>
                      <SelectItem value="description">Description</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="category">Category</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep("preview")}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={importMutation.isPending || !columnMapping.date || !columnMapping.amount}
                data-testid="button-import"
              >
                {importMutation.isPending ? "Importing..." : "Import Transactions"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "complete" && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Import Complete</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Your transactions have been successfully imported. You can now view them in the dashboard
              or generate a weekly report.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={resetUpload} data-testid="button-upload-another">
                Upload Another File
              </Button>
              <Button onClick={() => window.location.href = "/"} data-testid="button-go-dashboard">
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
