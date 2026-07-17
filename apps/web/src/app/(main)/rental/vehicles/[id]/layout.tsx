import { notFound } from "next/navigation";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { loadVehicleDetailAction, loadVehicleSwitcherList } from "@/app/actions/rental-vehicles";
import { VehicleWorkspaceTopBar } from "./vehicle-workspace-top-bar";

export default async function VehicleWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireRentalCompanyArea();
  const { id } = await params;
  const [data, fleet] = await Promise.all([loadVehicleDetailAction(id), loadVehicleSwitcherList()]);
  if (!data.ok) notFound();
  if ("error" in fleet) {
    return <p className="rph-alert-error text-sm">{fleet.error}</p>;
  }

  return (
    <div>
      <VehicleWorkspaceTopBar vehicle={data.vehicle} fleet={fleet} />
      {children}
    </div>
  );
}
