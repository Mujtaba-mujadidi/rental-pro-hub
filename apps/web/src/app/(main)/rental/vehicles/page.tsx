import { loadVehiclesPageData } from "@/app/actions/rental-vehicles";
import { VehiclesView } from "./vehicles-view";

export default async function RentalVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ subcompanyId?: string }>;
}) {
  const { subcompanyId } = await searchParams;
  const data = await loadVehiclesPageData();

  if ("error" in data) {
    return <p className="rph-alert-error text-sm">{data.error}</p>;
  }

  return (
    <VehiclesView
      vehicles={data.vehicles}
      subcompanies={data.subcompanies}
      notifySettings={data.notifySettings}
      canManage={data.canManage}
      canDelete={data.canDelete}
      initialSubcompanyId={subcompanyId?.trim() || null}
    />
  );
}
