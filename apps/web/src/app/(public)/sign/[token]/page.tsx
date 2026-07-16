import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findRecipientByAccessToken } from "@/lib/esign/envelope";
import { EsignSignClient } from "@/components/esign/signing-viewer";
import { fieldsForRole } from "@/lib/esign/roles";
import { ESIGN_RECIPIENT_ROLE, type EsignFieldLayoutItem } from "@/lib/esign/types";

export default async function PublicSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token?.trim()) notFound();

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return (
      <div className="p-8 text-center text-sm text-red-600">
        Signing is temporarily unavailable (server configuration).
      </div>
    );
  }

  const found = await findRecipientByAccessToken(admin, token.trim());
  if (!found.ok) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Link invalid</h1>
        <p className="mt-2 text-sm text-slate-600">{found.error}</p>
      </div>
    );
  }

  const { data: env } = await admin
    .from("esign_envelopes")
    .select("id, title, status, field_layout, expires_at")
    .eq("id", found.recipient.envelope_id)
    .maybeSingle();
  if (!env?.id) notFound();

  if (env.status === "void" || env.status === "expired") {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm">
        This signing request is no longer available.
      </div>
    );
  }
  if (env.expires_at && new Date(env.expires_at as string) < new Date()) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm">This signing link has expired.</div>
    );
  }

  const fields = Array.isArray(env.field_layout)
    ? fieldsForRole(env.field_layout as EsignFieldLayoutItem[], ESIGN_RECIPIENT_ROLE)
    : [];

  return (
    <EsignSignClient
      token={token.trim()}
      envelopeId={env.id as string}
      title={(env.title as string) || "Agreement"}
      fields={fields}
      initiallyVerified={!!found.recipient.verified_at}
      alreadySigned={!!found.recipient.signed_at || env.status === "completed"}
    />
  );
}
