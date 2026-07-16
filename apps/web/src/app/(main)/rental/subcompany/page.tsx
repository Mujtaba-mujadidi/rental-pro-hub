import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { redirectIfRentalOnboardingIncomplete } from "@/lib/auth/rental-onboarding";
import { SubcompaniesView } from "./subcompanies-view";

export default async function RentalSubcompaniesPage() {
  const { profile } = await requireRentalCompanyArea();
  await redirectIfRentalOnboardingIncomplete(profile.company_id);
  const mr = profile.membership_role;
  const canRegisterSubcompany = mr === "owner" || mr === "admin" || mr === "operations";
  return <SubcompaniesView canRegisterSubcompany={canRegisterSubcompany} />;
}
