import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { SubcompaniesView } from "./subcompanies-view";

export default async function RentalSubcompaniesPage() {
  const { profile } = await requireRentalCompanyArea();
  const mr = profile.membership_role;
  const canRegisterSubcompany = mr === "owner" || mr === "admin" || mr === "operations";
  return <SubcompaniesView canRegisterSubcompany={canRegisterSubcompany} />;
}
