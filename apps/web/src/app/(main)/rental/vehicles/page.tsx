import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { loadFleetPnlSummariesAction } from "@/app/actions/rental-vehicle-financials";
import { loadVehiclesPageData } from "@/app/actions/rental-vehicles";
import { VehiclesView } from "./vehicles-view";

export default async function RentalVehiclesPage() {
  await requireRentalCompanyArea();
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
    />
  );
}
