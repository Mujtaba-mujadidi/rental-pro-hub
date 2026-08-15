import { loadCompanyDashboardAction } from "@/app/actions/company-dashboard";
import { CompanyDashboardView } from "@/components/rental/company-dashboard/company-dashboard-view";

export default async function RentalCompanyHomePage() {
  const res = await loadCompanyDashboardAction();
  return (
    <CompanyDashboardView
      initialData={res.ok ? res.data : null}
      initialError={res.ok ? null : res.error}
    />
  );
}
