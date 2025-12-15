import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  FileImage,
  Mail,
  Eye
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/components/company-context";
import { EmptyState } from "@/components/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { IngestionJob, IngestionJobWithResults, IngestionResult } from "@/lib/types";
import { format } from "date-fns";

type ExtractedData = {
  vendor?: string;
  amount?: number;
  date?: string;
  description?: string;
  category?: string;
  items?: { name: string; quantity: number; unitPrice: number; total: number }[];
};

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
    case "approved":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "rejected":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "processing":
      return <Clock className="h-4 w-4 text-amber-500 animate-pulse" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Completed</Badge>;
    case "approved":
      return <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "processing":
      return <Badge variant="secondary">Processing</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getSourceIcon(sourceType: string) {
  switch (sourceType) {
    case "pdf":
      return <FileText className="h-5 w-5" />;
    case "image":
      return <FileImage className="h-5 w-5" />;
    case "email":
      return <Mail className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
}

export default function Documents() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [selectedJob, setSelectedJob] = useState<IngestionJobWithResults | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const { data: jobs, isLoading } = useQuery<IngestionJob[]>({
    queryKey: ["/api/companies", selectedCompany?.id, "ingestion", "jobs"],
    enabled: !!selectedCompany,
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { sourceType: string; filename: string }) => {
      return await apiRequest(
        "POST",
        `/api/companies/${selectedCompany!.id}/ingestion/upload`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "ingestion", "jobs"],
      });
      toast({
        title: "Document Uploaded",
        description: "Your document has been queued for processing.",
      });
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Failed to upload document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return await apiRequest("POST", `/api/ingestion/jobs/${jobId}/process`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "ingestion", "jobs"],
      });
      toast({
        title: "Processing Started",
        description: "Document is being processed. This may take a moment.",
      });
    },
    onError: () => {
      toast({
        title: "Processing Failed",
        description: "Failed to process document.",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (resultId: string) => {
      return await apiRequest("POST", `/api/ingestion/results/${resultId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "ingestion", "jobs"],
      });
      setReviewDialogOpen(false);
      setSelectedJob(null);
      toast({
        title: "Data Approved",
        description: "The extracted data has been approved and will be imported.",
      });
    },
    onError: () => {
      toast({
        title: "Approval Failed",
        description: "Failed to approve data.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (resultId: string) => {
      return await apiRequest("POST", `/api/ingestion/results/${resultId}/reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", selectedCompany?.id, "ingestion", "jobs"],
      });
      setReviewDialogOpen(false);
      setSelectedJob(null);
      toast({
        title: "Data Rejected",
        description: "The extracted data has been rejected.",
      });
    },
    onError: () => {
      toast({
        title: "Rejection Failed",
        description: "Failed to reject data.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (file: File) => {
    const sourceType = file.type.includes("pdf") ? "pdf" : "image";
    await uploadMutation.mutateAsync({
      sourceType,
      filename: file.name,
    });
  };

  const handleViewJob = async (job: IngestionJob) => {
    try {
      const response = await fetch(`/api/ingestion/jobs/${job.id}`);
      const data: IngestionJobWithResults = await response.json();
      setSelectedJob(data);
      setReviewDialogOpen(true);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load document details.",
        variant: "destructive",
      });
    }
  };

  if (!selectedCompany) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <EmptyState
          icon={FileText}
          title="No Company Selected"
          description="Please select or create a company to view documents."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-documents-title">Documents</h1>
          <p className="text-muted-foreground mt-1">
            Upload and review PDF invoices and receipt images
          </p>
        </div>
        <div>
          <input
            type="file"
            id="document-upload"
            className="hidden"
            accept=".pdf,image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = "";
            }}
            data-testid="input-document-upload"
          />
          <Button
            onClick={() => document.getElementById("document-upload")?.click()}
            disabled={uploadMutation.isPending}
            data-testid="button-upload-document"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-6 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Documents Yet"
          description="Upload a PDF invoice or receipt image to get started. We'll extract the data for your review."
          action={{
            label: "Upload Your First Document",
            onClick: () => document.getElementById("document-upload")?.click(),
          }}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id} className="hover-elevate" data-testid={`card-document-${job.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-md bg-muted">
                    {getSourceIcon(job.sourceType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate" data-testid={`text-filename-${job.id}`}>
                        {job.filename || "Untitled Document"}
                      </p>
                      {getStatusBadge(job.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(job.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => processMutation.mutate(job.id)}
                        disabled={processMutation.isPending}
                        data-testid={`button-process-${job.id}`}
                      >
                        Process
                      </Button>
                    )}
                    {(job.status === "completed" || job.status === "processing") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewJob(job)}
                        data-testid={`button-review-${job.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Review
                      </Button>
                    )}
                  </div>
                </div>
                {job.errorMessage && (
                  <p className="text-sm text-red-500 mt-2">{job.errorMessage}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedJob && getSourceIcon(selectedJob.sourceType)}
              Review Extracted Data
            </DialogTitle>
            <DialogDescription>
              Review the data extracted from {selectedJob?.filename || "your document"}.
              Approve to import or reject to discard.
            </DialogDescription>
          </DialogHeader>
          
          {selectedJob?.results && selectedJob.results.length > 0 ? (
            <ScrollArea className="max-h-[50vh]">
              {selectedJob.results.map((result) => {
                const extractedData = result.extractedJson as ExtractedData | null;
                return (
                  <div key={result.id} className="space-y-4 p-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(result.status)}
                        <span className="font-medium">Extraction Result</span>
                      </div>
                      {result.confidenceScore && (
                        <Badge variant="outline">
                          {parseFloat(result.confidenceScore).toFixed(0)}% confidence
                        </Badge>
                      )}
                    </div>

                    {extractedData && (
                      <Card>
                        <CardContent className="p-4 space-y-3">
                          {extractedData.vendor && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Vendor</span>
                              <span className="font-medium" data-testid="text-extracted-vendor">
                                {extractedData.vendor}
                              </span>
                            </div>
                          )}
                          {extractedData.amount !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Amount</span>
                              <span className="font-mono font-medium" data-testid="text-extracted-amount">
                                ${extractedData.amount.toLocaleString()}
                              </span>
                            </div>
                          )}
                          {extractedData.date && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Date</span>
                              <span data-testid="text-extracted-date">{extractedData.date}</span>
                            </div>
                          )}
                          {extractedData.category && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Category</span>
                              <Badge variant="secondary">{extractedData.category}</Badge>
                            </div>
                          )}
                          {extractedData.description && (
                            <>
                              <Separator />
                              <div>
                                <span className="text-muted-foreground text-sm">Description</span>
                                <p className="mt-1" data-testid="text-extracted-description">
                                  {extractedData.description}
                                </p>
                              </div>
                            </>
                          )}
                          {extractedData.items && extractedData.items.length > 0 && (
                            <>
                              <Separator />
                              <div>
                                <span className="text-muted-foreground text-sm">Line Items</span>
                                <div className="mt-2 space-y-2">
                                  {extractedData.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-sm">
                                      <span>{item.name} x{item.quantity}</span>
                                      <span className="font-mono">${item.total.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {result.rawText && (
                      <div>
                        <span className="text-muted-foreground text-sm">Raw Text</span>
                        <Card className="mt-1">
                          <CardContent className="p-3">
                            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                              {result.rawText}
                            </pre>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {result.status === "pending" && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          className="flex-1"
                          onClick={() => approveMutation.mutate(result.id)}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                          data-testid={`button-approve-${result.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {approveMutation.isPending ? "Approving..." : "Approve & Import"}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => rejectMutation.mutate(result.id)}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                          data-testid={`button-reject-${result.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          {rejectMutation.isPending ? "Rejecting..." : "Reject"}
                        </Button>
                      </div>
                    )}

                    {result.status === "approved" && (
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">This data has been approved and imported</span>
                      </div>
                    )}

                    {result.status === "rejected" && (
                      <div className="flex items-center gap-2 text-red-500">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm">This data was rejected</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2" />
              <p>No extraction results yet.</p>
              <p className="text-sm">The document is still being processed.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
