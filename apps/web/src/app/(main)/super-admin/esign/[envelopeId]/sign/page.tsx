import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EsignOwnerSignClient } from "@/components/esign/owner-sign-client";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

export default async function SuperAdminEsignOwnerSignPage({
  params,
}: {
  params: Promise<{ envelopeId: string }>;
}) {
  await requireSuperAdmin();
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
    .select("id, title, status, field_layout, owner_signed_at, unsigned_pdf_path")
    .eq("id", envelopeId)
    .maybeSingle();
  if (error || !env?.id || !env.unsigned_pdf_path) notFound();
  if (env.status === "completed" || env.status === "void") notFound();
  if (env.status === "sent" || env.status === "viewed") {
    redirect(`/super-admin/esign/${envelopeId}`);
  }

  const fields = Array.isArray(env.field_layout)
    ? (env.field_layout as EsignFieldLayoutItem[])
    : [];

  return (
    <EsignOwnerSignClient
      envelopeId={env.id as string}
      title={(env.title as string) || "Agreement"}
      fields={fields}
      alreadySigned={Boolean(env.owner_signed_at)}
    />
  );
}
