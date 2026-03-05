import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileJson, Loader2 } from "lucide-react";
import { downloadCSV, downloadJSON } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";

interface ExportButtonProps {
  data: Record<string, any>[];
  filename: string;
  columns?: { key: string; label: string }[];
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
}

export function ExportButton({
  data,
  filename,
  columns,
  variant = "outline",
  size = "sm",
  disabled = false,
}: ExportButtonProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = (format: "csv" | "json") => {
    if (!data.length) {
      toast({
        title: "No data to export",
        description: "There is no data available for export.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const dateStr = new Date().toISOString().split("T")[0];
      const fullFilename = `${filename}_${dateStr}`;

      if (format === "csv") {
        downloadCSV(data, fullFilename, columns);
      } else {
        downloadJSON(data, fullFilename);
      }

      toast({
        title: "Export successful",
        description: `Downloaded ${fullFilename}.${format}`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled || isExporting}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("json")}>
          <FileJson className="h-4 w-4 mr-2" />
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
