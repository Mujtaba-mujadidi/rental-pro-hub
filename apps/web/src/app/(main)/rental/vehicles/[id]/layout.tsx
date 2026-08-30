import { notFound } from "next/navigation";
import { getAppProfile } from "@/lib/auth/profile";
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
  const profile = await getAppProfile();
  const { id } = await params;
  const [data, fleet] = await Promise.all([getVehicleWorkspaceShell(id), loadVehicleSwitcherList()]);
  if (!data.ok) {
    if (data.error === "Vehicle not found.") notFound();
    return (
      <div className="rph-alert-error mx-auto max-w-2xl p-4 text-sm">
        <p className="font-semibold">Could not open this vehicle</p>
        <p className="mt-1">{data.error}</p>
      </div>
    );
  }
  if ("error" in fleet) {
    return <p className="rph-alert-error text-sm">{fleet.error}</p>;
  }

  const initialShell = {
    vehicle: data.vehicle,
    documents: data.documents,
    documentHistory: data.documentHistory,
    transfers: data.transfers,
    transferDocumentRequirements: data.transferDocumentRequirements,
    subcompanies: data.subcompanies,
    notifySettings: data.notifySettings,
    currentOpenHire: data.currentOpenHire,
    access: data.access,
    canManage: data.canManage,
    canDelete: data.canDelete,
  };

  return (
    <VehicleWorkspaceProvider key={id} vehicleId={id} initialShell={initialShell}>
      <VehicleWorkspaceTopBar fleet={fleet} />
      <VehicleDocAttentionBanner canConfirm={profile ? canWriteMaintenance(profile) : false} />
      {children}
    </VehicleWorkspaceProvider>
  );
}
