import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { FleetHiresView } from "./fleet-hires-view";

export default async function RentalHiresPage({
  searchParams,
}: {
  searchParams: Promise<{ subcompanyId?: string }>;
}) {
  await requireRentalCompanyArea();
  const { subcompanyId } = await searchParams;
  return <FleetHiresView initialSubcompanyId={subcompanyId?.trim() || null} />;
}
