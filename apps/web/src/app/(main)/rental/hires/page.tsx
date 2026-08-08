import { listHireContractsAction } from "@/app/actions/rental-hire-wizard";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { FleetHiresView } from "./fleet-hires-view";

export default async function RentalHiresPage({
  searchParams,
}: {
  searchParams: Promise<{ subcompanyId?: string }>;
}) {
  await requireRentalCompanyArea();
  const { subcompanyId } = await searchParams;
  const res = await listHireContractsAction();
  if (!res.ok) {
    return <p className="rph-alert-error text-sm">{res.error}</p>;
  }

  return (
    <FleetHiresView
      initialSubcompanyId={subcompanyId?.trim() || null}
      initialRows={res.rows}
      initialCanWrite={res.canWrite}
    />
  );
}
