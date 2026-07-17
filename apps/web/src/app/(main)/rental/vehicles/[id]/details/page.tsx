import { notFound } from "next/navigation";
import { loadVehicleDetailAction } from "@/app/actions/rental-vehicles";
import { VehicleDetailsView } from "./vehicle-details-view";

export default async function VehicleDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadVehicleDetailAction(id);
  if (!data.ok) notFound();

  return (
    <VehicleDetailsView
      initialVehicle={data.vehicle}
      initialDocuments={data.documents}
      initialTransfers={data.transfers}
      subcompanies={data.subcompanies}
      canManage={data.canManage}
      canDelete={data.canDelete}
    />
  );
}
