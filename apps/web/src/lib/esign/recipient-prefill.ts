import { PLATFORM_COMPANY_CONTRACT_CONTEXT } from "@/lib/esign/adapters/platform-company-contract";
import {
  loadParentCompanyOwnerContact,
  resolveContractSignatoryFromSources,
} from "@/lib/companies/contract-change-signatory";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Name to prefill on the recipient signing walkthrough (editable by the signer). */
export async function resolveEsignRecipientPrefillName(
  admin: Admin,
  envelopeId: string,
  recipient: { name?: string | null; email?: string | null },
): Promise<string | null> {
  const stored = recipient.name?.trim();
  if (stored) return stored;

  const { data: env } = await admin
    .from("esign_envelopes")
    .select("context_type, parent_company_id")
    .eq("id", envelopeId)
    .maybeSingle();

  if (env?.context_type !== PLATFORM_COMPANY_CONTRACT_CONTEXT || !env.parent_company_id) {
    return null;
  }

  const parentCompanyId = env.parent_company_id as string;
  const { data: change } = await admin
    .from("company_contract_change_requests")
    .select(
      "signatory_name, signatory_email, proposed_primary_contact_first_name, proposed_primary_contact_last_name, proposed_primary_contact_email",
    )
    .eq("esign_envelope_id", envelopeId)
    .maybeSingle();

  const owner = await loadParentCompanyOwnerContact(admin, parentCompanyId);
  const resolved = resolveContractSignatoryFromSources({
    signatoryName: change?.signatory_name,
    signatoryEmail: change?.signatory_email ?? recipient.email,
    ownerDisplayName: owner.displayName,
    ownerEmail: owner.email,
    primaryContactFirstName: change?.proposed_primary_contact_first_name,
    primaryContactLastName: change?.proposed_primary_contact_last_name,
    primaryContactEmail: change?.proposed_primary_contact_email,
  });

  return resolved.name || null;
}

/** Keep esign_recipients.name aligned with the resolved platform contract signatory. */
export async function syncPlatformContractRecipientName(
  admin: Admin,
  envelopeId: string,
  name: string | null,
): Promise<void> {
  const trimmed = name?.trim();
  if (!trimmed) return;
  await admin
    .from("esign_recipients")
    .update({ name: trimmed })
    .eq("envelope_id", envelopeId);
}
