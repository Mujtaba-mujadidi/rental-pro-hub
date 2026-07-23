import { notFound, redirect } from "next/navigation";
import { loadDriverHireSignedDocumentsAction } from "@/app/actions/hire-signed-documents";
import { HireSignedDocumentsView } from "@/components/fleet/hire-signed-documents-view";
import { driverHireDocumentsBackLink } from "@/lib/fleet/driver-hire-nav";

export default async function DriverHireSignedDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { groupId } = await params;
  const { from } = await searchParams;
  const res = await loadDriverHireSignedDocumentsAction(groupId);
  if (!res.ok) {
    if (res.error === "Sign in required.") redirect("/login");
    notFound();
  }

  const { payload } = res;
  const subtitle = payload.vehicleVrm;
  const back = driverHireDocumentsBackLink(from);

  return (
    <HireSignedDocumentsView
      title="Your signed hire agreements"
      subtitle={subtitle}
      documents={payload.documents}
      backHref={back.href}
      backLabel={back.label}
    />
  );
}
