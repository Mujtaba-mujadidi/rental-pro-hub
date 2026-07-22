import { notFound } from "next/navigation";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canWriteMaintenance } from "@/lib/auth/rental-permissions";
import { getVehicleWorkspaceShell } from "@/lib/fleet/load-vehicle-workspace-shell";
import { loadVehicleSwitcherList } from "@/app/actions/rental-vehicles";
import { VehicleDocAttentionBanner } from "./vehicle-doc-attention-banner";
import { VehicleWorkspaceProvider } from "./vehicle-workspace-provider";
import { VehicleWorkspaceTopBar } from "./vehicle-workspace-top-bar";

export default async function VehicleWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireRentalCompanyArea();
  const { id } = await params;
  const [data, fleet] = await Promise.all([getVehicleWorkspaceShell(id), loadVehicleSwitcherList()]);
  if (!data.ok) notFound();
  if ("error" in fleet) {
    return <p className="rph-alert-error text-sm">{fleet.error}</p>;
  }

  const initialShell = {
    vehicle: data.vehicle,
    documents: data.documents,
    transfers: data.transfers,
    subcompanies: data.subcompanies,
    notifySettings: data.notifySettings,
    canManage: data.canManage,
    canDelete: data.canDelete,
  };

  return (
    <VehicleWorkspaceProvider vehicleId={id} initialShell={initialShell}>
      <VehicleWorkspaceTopBar fleet={fleet} />
      <VehicleDocAttentionBanner canConfirm={canWriteMaintenance(profile)} />
      {children}
    </VehicleWorkspaceProvider>
  );
}
