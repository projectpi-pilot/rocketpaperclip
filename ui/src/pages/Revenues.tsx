import { useEffect } from "react";
import { Coins } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";

export function Revenues() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Revenues" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Coins} message="Select a company to view revenues." />;
  }

  return (
    <EmptyState
      icon={Coins}
      message="Revenue tracking is ready for wiring. This page will hold top-line revenue, recurring revenue, and attribution views."
    />
  );
}
