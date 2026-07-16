import { requireSuperAdmin } from "@/lib/auth/profile";
import { CompaniesView } from "./companies-view";

export default async function SuperAdminCompaniesPage() {
  await requireSuperAdmin();
  return <CompaniesView />;
}
