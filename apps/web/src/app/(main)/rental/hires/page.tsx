import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { FleetHiresView } from "./fleet-hires-view";

export default async function RentalHiresPage() {
  await requireRentalCompanyArea();
  return <FleetHiresView />;
}
