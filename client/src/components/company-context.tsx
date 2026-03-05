import { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { Company } from "@/lib/types";
import { useAuth } from "@/components/auth-context";
import type { Role } from "@/lib/permissions";

type CompanyContextType = {
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  companies: Company[];
  setCompanies: (companies: Company[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  // New role-related properties
  currentCompany: Company | null;
  currentRole: Role | null;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Get the current role for the selected company
  const currentRole = useMemo<Role | null>(() => {
    if (!user || !selectedCompany) return null;
    const userCompany = user.companies?.find(
      (uc) => uc.companyId === selectedCompany.id
    );
    return (userCompany?.role as Role) || null;
  }, [user, selectedCompany]);

  useEffect(() => {
    const storedCompanyId = localStorage.getItem("selectedCompanyId");
    if (storedCompanyId && companies.length > 0) {
      const company = companies.find((c) => c.id === storedCompanyId);
      if (company) {
        setSelectedCompany(company);
      } else if (companies.length > 0) {
        setSelectedCompany(companies[0]);
      }
    } else if (companies.length > 0 && !selectedCompany) {
      setSelectedCompany(companies[0]);
    }
  }, [companies]);

  useEffect(() => {
    if (selectedCompany) {
      localStorage.setItem("selectedCompanyId", selectedCompany.id);
    }
  }, [selectedCompany]);

  return (
    <CompanyContext.Provider
      value={{
        selectedCompany,
        setSelectedCompany,
        companies,
        setCompanies,
        isLoading,
        setIsLoading,
        currentCompany: selectedCompany,
        currentRole,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
