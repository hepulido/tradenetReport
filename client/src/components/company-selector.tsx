import { Building2, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompany } from "@/components/company-context";

interface CompanySelectorProps {
  onCreateNew?: () => void;
}

export function CompanySelector({ onCreateNew }: CompanySelectorProps) {
  const { selectedCompany, setSelectedCompany, companies } = useCompany();

  if (!selectedCompany) {
    return (
      <Button variant="outline" disabled data-testid="button-company-selector">
        <Building2 className="mr-2 h-4 w-4" />
        Loading...
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-company-selector">
          <Building2 className="h-4 w-4" />
          <span className="max-w-32 truncate">{selectedCompany.name}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => setSelectedCompany(company)}
            className={company.id === selectedCompany.id ? "bg-accent" : ""}
            data-testid={`menu-item-company-${company.id}`}
          >
            <Building2 className="mr-2 h-4 w-4" />
            {company.name}
          </DropdownMenuItem>
        ))}
        {onCreateNew && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateNew} data-testid="button-create-company">
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
