import { loadVehicleFinancialsAction } from "@/app/actions/rental-vehicle-financials";
import { VehicleFinancialsView } from "./vehicle-financials-view";

export default async function VehicleFinancialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadVehicleFinancialsAction(id);

  if (!res.ok) {
    return <p className="rph-alert-error text-sm">{res.error}</p>;
  }

  return <VehicleFinancialsView initial={res.data} />;
}
