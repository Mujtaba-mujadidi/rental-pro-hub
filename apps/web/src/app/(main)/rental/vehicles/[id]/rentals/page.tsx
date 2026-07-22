import { loadVehicleRentalsAction } from "@/app/actions/rental-hires";
import { VehicleRentalsTableView } from "./vehicle-rentals-table-view";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function VehicleRentalsPage({ params }: Props) {
  const { id } = await params;
  const res = await loadVehicleRentalsAction(id);
  const notifyDays = res.ok ? res.data.notify_contract_expiry_days_before : 28;

  return <VehicleRentalsTableView vehicleId={id} notifyDays={notifyDays} />;
}
