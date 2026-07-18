import { RentalSettingsClient } from "@/app/(main)/rental/settings/rental-settings-client";
import { requireRentalCompanyArea } from "@/lib/auth/profile";

export default async function RentalSettingsPage() {
  await requireRentalCompanyArea();
  return <RentalSettingsClient />;
}
