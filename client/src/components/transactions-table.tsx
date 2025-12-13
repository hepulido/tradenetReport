import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface TransactionsTableProps {
  transactions: Transaction[];
  projectNames?: Record<string, string>;
}

export function TransactionsTable({
  transactions,
  projectNames = {},
}: TransactionsTableProps) {
  const formatCurrency = (value: string | number) => {
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(numValue);
  };

  const getCategoryColor = (category: string | null) => {
    switch (category?.toLowerCase()) {
      case "material":
      case "materials":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "labor":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "equipment":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "subcontract":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
      case "revenue":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
      default:
        return "";
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-transactions">
        <div className="rounded-full bg-muted p-4 mb-4">
          <ArrowDownLeft className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">No transactions yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Upload a CSV file or add transactions manually to see them here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="w-full" data-testid="transactions-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((txn, index) => (
            <TableRow
              key={txn.id}
              className={index % 2 === 0 ? "" : "bg-muted/30"}
              data-testid={`row-transaction-${txn.id}`}
            >
              <TableCell className="font-mono text-xs">
                {format(new Date(txn.txnDate), "MMM d")}
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {txn.description || txn.memo || "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {txn.projectId ? projectNames[txn.projectId] || "Unknown" : "-"}
              </TableCell>
              <TableCell>
                {txn.category && (
                  <Badge
                    variant="secondary"
                    className={cn("capitalize text-xs", getCategoryColor(txn.category))}
                  >
                    {txn.category}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {txn.vendor || "-"}
              </TableCell>
              <TableCell className="text-right font-mono">
                <div
                  className={cn(
                    "flex items-center justify-end gap-1",
                    txn.direction === "in"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  {txn.direction === "in" ? (
                    <ArrowDownLeft className="h-3 w-3" />
                  ) : (
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span>{formatCurrency(txn.amount)}</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
