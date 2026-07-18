import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canWriteSubcompany } from "@/lib/auth/rental-permissions";
import { SubcompaniesView } from "./subcompanies-view";

export default async function RentalSubcompaniesPage() {
  const { profile } = await requireRentalCompanyArea();
  const canRegisterSubcompany = canWriteSubcompany(profile);
  return <SubcompaniesView canRegisterSubcompany={canRegisterSubcompany} />;
}
