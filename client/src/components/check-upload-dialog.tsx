import { useState, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileImage, AlertTriangle, Check, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface CheckUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: string;
    status: string;
  }>;
}

interface ExtractedCheckData {
  checkNumber: string | null;
  amount: string | null;
  date: string | null;
  payee: string | null;
  payer: string | null;
  memo: string | null;
}

export function CheckUploadDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  invoices,
}: CheckUploadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"upload" | "review" | "saving">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedCheckData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state for review
  const [checkNumber, setCheckNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [checkDate, setCheckDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [payer, setPayer] = useState("");

  // Get unpaid invoices
  const unpaidInvoices = invoices.filter(inv => inv.status !== "paid");

  // Parse check mutation
  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      formData.append("type", "check");

      const response = await fetch("/api/parse-check", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to parse check");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setExtractedData(data.extracted);
      // Pre-fill form with extracted data
      if (data.extracted) {
        setCheckNumber(data.extracted.checkNumber || "");
        setAmount(data.extracted.amount || "");
        setPayer(data.extracted.payer || data.extracted.payee || "");
        setMemo(data.extracted.memo || "");
        if (data.extracted.date) {
          // Try to parse and format date
          try {
            const parsed = new Date(data.extracted.date);
            if (!isNaN(parsed.getTime())) {
              setCheckDate(format(parsed, "yyyy-MM-dd"));
            }
          } catch (e) {
            // Keep default date
          }
        }
      }
      setStep("review");
    },
    onError: (error: any) => {
      setError(error.message || "Failed to parse check image");
    },
  });

  // Save payment mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        amount: parseFloat(amount) || 0,
        paymentDate: checkDate,
        paymentMethod: "check",
        referenceNumber: checkNumber,
        notes: memo ? `From: ${payer}. ${memo}` : payer ? `From: ${payer}` : null,
        projectInvoiceId: linkedInvoiceId || null,
      };

      const response = await fetch(`/api/projects/${projectId}/payments-received`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to record payment");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment Recorded",
        description: `Check #${checkNumber} for $${parseFloat(amount).toLocaleString()} has been recorded.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/payments-received`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/invoices`] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
      setStep("review");
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
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
  });

  const handleClose = () => {
    setStep("upload");
    setFile(null);
    setExtractedData(null);
    setError(null);
    setCheckNumber("");
    setAmount("");
    setCheckDate(format(new Date(), "yyyy-MM-dd"));
    setLinkedInvoiceId("");
    setMemo("");
    setPayer("");
    onOpenChange(false);
  };

  const handleSave = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Amount required",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }
    setStep("saving");
    saveMutation.mutate();
  };

  const handleManualEntry = () => {
    // Skip parsing and go directly to review
    setStep("review");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Record Check Payment
          </DialogTitle>
          <DialogDescription>
            Upload a check image or enter payment details for {projectName}
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
                  <p className="mt-2 text-sm text-muted-foreground">Extracting check details...</p>
                </>
              ) : (
                <>
                  <FileImage className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isDragActive ? "Drop the check image here" : "Drag & drop a check image, or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports images (PNG, JPG) and PDF
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

            <div className="text-center">
              <span className="text-sm text-muted-foreground">or</span>
            </div>

            <Button variant="outline" className="w-full" onClick={handleManualEntry}>
              Enter Details Manually
            </Button>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {extractedData && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm text-green-700">Check details extracted. Please verify and save.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkNumber">Check Number</Label>
                <Input
                  id="checkNumber"
                  placeholder="e.g., 1234"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkDate">Check Date</Label>
                <Input
                  id="checkDate"
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payer">From (Payer)</Label>
                <Input
                  id="payer"
                  placeholder="e.g., ABC Construction"
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedInvoice">Link to Invoice (optional)</Label>
              <Select value={linkedInvoiceId} onValueChange={setLinkedInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an invoice..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No linked invoice</SelectItem>
                  {unpaidInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      #{inv.invoiceNumber} - ${parseFloat(inv.amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link this payment to an outstanding invoice
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo">Memo / Notes</Label>
              <Textarea
                id="memo"
                placeholder="Additional notes..."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button onClick={handleSave} disabled={!amount || parseFloat(amount) <= 0}>
                <Check className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Saving */}
        {step === "saving" && (
          <div className="py-8 text-center">
            <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
            <p className="mt-4 font-medium">Recording payment...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
