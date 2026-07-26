import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { superAdminEsignDesignerBack } from "@/lib/admin/contract-change-display";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EsignDesignerClient } from "@/components/esign/esign-clients";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

export default async function SuperAdminEsignDesignerPage({
  params,
  searchParams,
}: {
  params: Promise<{ envelopeId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { user, profile } = await requireSuperAdmin();
  const { envelopeId } = await params;
  const { from } = await searchParams;
  if (!envelopeId?.trim()) notFound();

  const { backHref, backLabel } = superAdminEsignDesignerBack(from);

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    redirect("/super-admin/companies");
  }

  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select(
      "id, title, status, context_type, field_layout, unsigned_pdf_path, signed_pdf_path, completed_at, owner_signed_at, requires_owner_signature",
    )
    .eq("id", envelopeId)
    .maybeSingle();
  if (error || !env?.id) notFound();
  if (!env.unsigned_pdf_path && !env.signed_pdf_path) notFound();

  const fields = Array.isArray(env.field_layout)
    ? (env.field_layout as EsignFieldLayoutItem[])
    : [];

  const defaultOwnerName =
    profile.display_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    user.email?.split("@")[0] ||
    "";

  return (
    <EsignDesignerClient
      envelopeId={env.id as string}
      title={(env.title as string) || "Agreement"}
      status={(env.status as string) || "draft"}
      initialFields={fields}
      hasSignedPdf={Boolean(env.signed_pdf_path)}
      completedAt={(env.completed_at as string | null) ?? null}
      ownerSigned={Boolean(env.owner_signed_at)}
      requiresOwnerSignature={env.requires_owner_signature !== false}
      modeConfigured={fields.length > 0}
      defaultOwnerName={defaultOwnerName}
      backHref={backHref}
      backLabel={backLabel}
      allowRegeneratePdf={env.context_type === "platform_company_contract"}
    />
  );
}
