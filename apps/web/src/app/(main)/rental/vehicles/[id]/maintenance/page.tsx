import { loadVehicleMaintenancePageAction } from "@/app/actions/rental-maintenance";
import { VehicleMaintenanceView } from "./vehicle-maintenance-view";

export default async function VehicleMaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadVehicleMaintenancePageAction(id);

  if (!res.ok) {
    return <p className="rph-alert-error text-sm">{res.error}</p>;
  }

  return <VehicleMaintenanceView initial={res.data} />;
}
