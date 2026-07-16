import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EsignDesignerClient } from "@/components/esign/esign-clients";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

export default async function SuperAdminEsignDesignerPage({
  params,
}: {
  params: Promise<{ envelopeId: string }>;
}) {
  const { user, profile } = await requireSuperAdmin();
  const { envelopeId } = await params;
  if (!envelopeId?.trim()) notFound();

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    redirect("/super-admin/companies");
  }

  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select(
      "id, title, status, field_layout, unsigned_pdf_path, signed_pdf_path, completed_at, owner_signed_at, requires_owner_signature",
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
    />
  );
}
