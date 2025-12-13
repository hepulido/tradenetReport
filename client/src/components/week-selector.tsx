import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

interface WeekSelectorProps {
  weekStart: Date;
  onChange: (date: Date) => void;
}

export function WeekSelector({ weekStart, onChange }: WeekSelectorProps) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const handlePreviousWeek = () => {
    onChange(subWeeks(weekStart, 1));
  };

  const handleNextWeek = () => {
    const nextWeek = addWeeks(weekStart, 1);
    const now = new Date();
    if (nextWeek <= startOfWeek(now, { weekStartsOn: 1 })) {
      onChange(nextWeek);
    }
  };

  const handleCurrentWeek = () => {
    onChange(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  const isCurrentWeek =
    startOfWeek(new Date(), { weekStartsOn: 1 }).getTime() === weekStart.getTime();

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="week-selector">
      <Button
        variant="outline"
        size="icon"
        onClick={handlePreviousWeek}
        data-testid="button-previous-week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 px-3 py-2 bg-card border rounded-md min-w-[200px] justify-center">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium" data-testid="text-week-range">
          {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
        </span>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={handleNextWeek}
        disabled={isCurrentWeek}
        data-testid="button-next-week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {!isCurrentWeek && (
        <Button variant="ghost" size="sm" onClick={handleCurrentWeek} data-testid="button-current-week">
          Current Week
        </Button>
      )}
    </div>
  );
}
