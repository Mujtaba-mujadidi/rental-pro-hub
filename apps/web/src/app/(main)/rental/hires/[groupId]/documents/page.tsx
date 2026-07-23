import { notFound, redirect } from "next/navigation";
import { loadRentalHireSignedDocumentsAction } from "@/app/actions/hire-signed-documents";
import { HireSignedDocumentsView } from "@/components/fleet/hire-signed-documents-view";

export default async function RentalHireSignedDocumentsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const res = await loadRentalHireSignedDocumentsAction(groupId);
  if (!res.ok) {
    if (res.error === "You do not have permission.") redirect("/rental/hires");
    notFound();
  }

  const { payload } = res;
  const subtitle = [payload.vehicleVrm, payload.driverLabel].filter(Boolean).join(" · ");

  return (
    <HireSignedDocumentsView
      title="Signed hire agreements"
      subtitle={subtitle}
      documents={payload.documents}
    />
  );
}
