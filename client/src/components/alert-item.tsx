import { AlertTriangle, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertItemProps {
  message: string;
  type?: "warning" | "danger" | "info";
}

export function AlertItem({ message, type = "warning" }: AlertItemProps) {
  const getIcon = () => {
    if (message.toLowerCase().includes("margin")) {
      return <TrendingDown className="h-4 w-4 shrink-0" />;
    }
    if (message.toLowerCase().includes("cost") || message.toLowerCase().includes("spike")) {
      return <DollarSign className="h-4 w-4 shrink-0" />;
    }
    return <AlertTriangle className="h-4 w-4 shrink-0" />;
  };

  const getStyles = () => {
    switch (type) {
      case "danger":
        return "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
      case "info":
        return "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
      default:
        return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800";
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-md border",
        getStyles()
      )}
      data-testid="alert-item"
    >
      {getIcon()}
      <p className="text-sm leading-relaxed">{message}</p>
    </div>
  );
}
