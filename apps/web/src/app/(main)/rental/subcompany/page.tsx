import { loadSubcompaniesPortfolioAction } from "@/app/actions/subcompanies-portfolio";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canWriteSubcompany } from "@/lib/auth/rental-permissions";
import { SubcompaniesView } from "./subcompanies-view";

export default async function RentalSubcompaniesPage() {
  const { profile } = await requireRentalCompanyArea();
  const canRegisterSubcompany = canWriteSubcompany(profile);
  const portfolio = await loadSubcompaniesPortfolioAction();
  return (
    <SubcompaniesView
      canRegisterSubcompany={canRegisterSubcompany}
      initialData={portfolio.ok ? portfolio.data : null}
      initialError={portfolio.ok ? null : portfolio.error}
    />
  );
}
