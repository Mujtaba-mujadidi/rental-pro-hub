import { loadFleetPnlSummariesAction } from "@/app/actions/rental-vehicle-financials";
import { loadVehiclesPageData } from "@/app/actions/rental-vehicles";
import { getSubcompanyWorkspaceShell } from "@/lib/rental/load-subcompany-workspace-shell";
import { VehiclesView } from "@/app/(main)/rental/vehicles/vehicles-view";
import { notFound } from "next/navigation";

export default async function SubcompanyVehiclesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shell = await getSubcompanyWorkspaceShell(id);
  if (!shell.ok) notFound();

  const data = await loadVehiclesPageData();
  if ("error" in data) {
    return <p className="rph-alert-error text-sm">{data.error}</p>;
  }

  const pnlRes = await loadFleetPnlSummariesAction(data.vehicles.map((v) => v.id));
  const pnlByVehicle = new Map(
    pnlRes.ok ? pnlRes.summaries.map((s) => [s.vehicleId, s]) : [],
  );

  return (
    <VehiclesView
      vehicles={data.vehicles}
      subcompanies={data.subcompanies}
      notifySettings={data.notifySettings}
      canManage={data.canManage}
      canDelete={data.canDelete}
      pnlByVehicle={pnlByVehicle}
      lockedSubcompanyId={shell.shell.subcompany.id}
    />
  );
}
