import { notFound, redirect } from "next/navigation";
import { loadDriverHireSignedDocumentsAction } from "@/app/actions/hire-signed-documents";
import { HireSignedDocumentsView } from "@/components/fleet/hire-signed-documents-view";

export default async function DriverHireSignedDocumentsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const res = await loadDriverHireSignedDocumentsAction(groupId);
  if (!res.ok) {
    if (res.error === "Sign in required.") redirect("/login");
    notFound();
  }

  const { payload } = res;
  const subtitle = payload.vehicleVrm;

  return (
    <HireSignedDocumentsView
      title="Your signed hire agreements"
      subtitle={subtitle}
      documents={payload.documents}
      backHref="/driver/hire-requests"
      backLabel="Hire requests"
    />
  );
}
