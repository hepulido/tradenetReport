import { useCallback, useState } from "react";
import { Upload, FileText, X, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadStatus?: "idle" | "uploading" | "success" | "error";
  errorMessage?: string;
}

export function FileUpload({
  onFileSelect,
  accept = ".csv",
  maxSize = 10 * 1024 * 1024,
  isUploading = false,
  uploadProgress = 0,
  uploadStatus = "idle",
  errorMessage,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const validateFile = (file: File): string | null => {
    if (!file.name.endsWith(".csv")) {
      return "Please upload a CSV file";
    }
    if (file.size > maxSize) {
      return `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`;
    }
    return null;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        const error = validateFile(file);
        if (!error) {
          setSelectedFile(file);
          onFileSelect(file);
        }
      }
    },
    [onFileSelect, maxSize]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const error = validateFile(file);
      if (!error) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (selectedFile && uploadStatus !== "idle") {
    return (
      <Card data-testid="file-upload-status">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-accent p-3">
              <FileText className="h-5 w-5 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                {uploadStatus === "idle" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                    data-testid="button-clear-file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatFileSize(selectedFile.size)}
              </p>
              {uploadStatus === "uploading" && (
                <div className="mt-3">
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              )}
              {uploadStatus === "success" && (
                <div className="flex items-center gap-2 mt-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                  <p className="text-xs font-medium">Upload complete</p>
                </div>
              )}
              {uploadStatus === "error" && (
                <div className="flex items-center gap-2 mt-2 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-xs">{errorMessage || "Upload failed"}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "border-2 border-dashed transition-colors",
        isDragOver && "border-primary bg-accent/50",
        isUploading && "pointer-events-none opacity-60"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="file-upload-dropzone"
    >
      <CardContent className="p-8 flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-accent p-4 mb-4">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">Drop your CSV file here</h3>
        <p className="text-sm text-muted-foreground mb-4">
          or click to browse your files
        </p>
        <input
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
          id="file-upload-input"
          data-testid="input-file-upload"
        />
        <label htmlFor="file-upload-input">
          <Button asChild variant="outline">
            <span>Select File</span>
          </Button>
        </label>
        <p className="text-xs text-muted-foreground mt-4">
          Supports CSV files up to {Math.round(maxSize / 1024 / 1024)}MB
        </p>
      </CardContent>
    </Card>
  );
}
