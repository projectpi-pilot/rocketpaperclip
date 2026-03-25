import { useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";

export function Analytics() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Analytics" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={BarChart3} message="Select a company to view analytics." />;
  }

  return (
    <EmptyState
      icon={BarChart3}
      message="Analytics is staged here for cross-agent performance, throughput, and workflow trend views."
    />
  );
}
