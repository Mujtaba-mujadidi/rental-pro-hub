import { notFound, redirect } from "next/navigation";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { rentalEsignDesignerActions } from "@/app/actions/rental-esign-designer-actions";
import { EsignDesignerClient } from "@/components/esign/esign-clients";
import { VEHICLE_HIRE_AGREEMENT_CONTEXT } from "@/lib/esign/adapters/vehicle-hire-agreement";
import { syncHireEnvelopeFromGroupSignatureMode } from "@/lib/esign/hire-group-signature-mode";
import { loadHireEnvelopeDesignerContext } from "@/lib/esign/hire-envelope-designer";
import type { HireEnvelopeDesignerContext } from "@/lib/esign/hire-envelope-designer";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function RentalEsignDesignerPage({
  params,
}: {
  params: Promise<{ envelopeId: string }>;
}) {
  const { user, profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) redirect("/rental/hires");

  const { envelopeId } = await params;
  if (!envelopeId?.trim()) notFound();

  const companyId = profile.company_id?.trim();
  if (!companyId) redirect("/rental/hires");

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    redirect("/rental/hires");
  }

  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select(
      "id, title, status, field_layout, unsigned_pdf_path, signed_pdf_path, completed_at, owner_signed_at, requires_owner_signature, parent_company_id, context_type",
    )
    .eq("id", envelopeId)
    .maybeSingle();
  if (error || !env?.id) notFound();
  if (env.parent_company_id !== companyId || env.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT) {
    notFound();
  }
  if (!env.unsigned_pdf_path && !env.signed_pdf_path) notFound();

  const isCompleted = env.status === "completed";
  if (!isCompleted && !canWriteRentals(profile)) redirect("/rental/hires");

  let fields = Array.isArray(env.field_layout) ? (env.field_layout as EsignFieldLayoutItem[]) : [];
  let requiresOwnerSignature = env.requires_owner_signature === true;

  let hireBundleContext: HireEnvelopeDesignerContext | null = null;
  hireBundleContext = await loadHireEnvelopeDesignerContext(admin, env.id as string);

  if (hireBundleContext?.sharedSignatureMode && fields.length === 0) {
    const synced = await syncHireEnvelopeFromGroupSignatureMode(admin, env.id as string);
    if (synced.ok && synced.synced) {
      fields = synced.fields;
      requiresOwnerSignature = synced.requiresOwner;
    }
  }

  const defaultOwnerName =
    profile.display_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    user.email?.split("@")[0] ||
    "";

  return (
    <EsignDesignerClient
      envelopeId={env.id as string}
      title={(env.title as string) || "Hire agreement"}
      status={(env.status as string) || "draft"}
      initialFields={fields}
      hasSignedPdf={Boolean(env.signed_pdf_path)}
      completedAt={(env.completed_at as string | null) ?? null}
      ownerSigned={Boolean(env.owner_signed_at)}
      requiresOwnerSignature={requiresOwnerSignature}
      modeConfigured={fields.length > 0}
      defaultOwnerName={defaultOwnerName}
      backHref="/rental/hires"
      backLabel="Hires"
      designerActions={rentalEsignDesignerActions}
      recipientOnlyTitle="Hirer only"
      recipientOnlyDescription="Only the hirer signs. No lessor signature on this contract."
      ownerAndRecipientTitle="Lessor + hirer"
      ownerAndRecipientDescription="You sign as lessor first, then send to the hirer."
      hireBundleContext={hireBundleContext}
    />
  );
}
