import { CONTRACT_LENGTH_LABELS } from "@/lib/fleet/hire-access-display";
import { hireAgreementsToEnvelopeReadyRows, type HireAgreementEnvelopeSource } from "@/lib/fleet/hire-envelope-readiness";
import { sortHireBundleAgreements } from "@/lib/fleet/hire-signing-bundle";
import type { ContractLengthKind } from "@/lib/fleet/hire-types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type HireSignedDocumentRow = {
  envelopeId: string;
  title: string;
  lengthLabel: string;
  signedAt: string | null;
  pdfUrl: string;
};

export function hireSignedDocumentPdfUrl(envelopeId: string, bundleToken?: string | null): string {
  const base = `/api/esign/${envelopeId.trim()}/pdf?variant=signed`;
  const token = bundleToken?.trim();
  return token ? `${base}&bundleToken=${encodeURIComponent(token)}` : base;
}

export async function loadHireGroupSignedDocuments(
  admin: Admin,
  hireGroupId: string,
): Promise<HireSignedDocumentRow[]> {
  const id = hireGroupId.trim();
  if (!id) return [];

  const { data: agreements, error } = await admin
    .from("vehicle_hire_agreements")
    .select(
      "id, contract_length_kind, end_date, esign_envelope_id, signed_at, esign_envelopes(id, title, status, completed_at, esign_recipients(signed_at))",
    )
    .eq("hire_group_id", id);
  if (error) throw new Error(error.message);

  const envelopeRows = hireAgreementsToEnvelopeReadyRows((agreements ?? []) as HireAgreementEnvelopeSource[]);
  const signedByEnvelope = new Map(
    envelopeRows.filter((row) => row.signed).map((row) => [row.envelopeId, row] as const),
  );

  const sorted = sortHireBundleAgreements(
    (agreements ?? []).map((a) => ({
      agreementId: a.id as string,
      contractLengthKind: a.contract_length_kind as ContractLengthKind,
      endDate: (a.end_date as string) ?? "",
      envelopeId: (a.esign_envelope_id as string | null) ?? null,
    })),
  );

  const documents: HireSignedDocumentRow[] = [];
  for (const item of sorted) {
    if (!item.envelopeId) continue;
    const ready = signedByEnvelope.get(item.envelopeId);
    if (!ready) continue;

    const agreement = (agreements ?? []).find((a) => a.id === item.agreementId) as
      | {
          signed_at?: string | null;
          esign_envelopes?: {
            title?: string | null;
            completed_at?: string | null;
            esign_recipients?: { signed_at?: string | null }[];
          } | null;
        }
      | undefined;

    const env = agreement?.esign_envelopes;
    const recipientSignedAt = env?.esign_recipients?.[0]?.signed_at ?? null;
    const signedAt =
      (agreement?.signed_at as string | null) ??
      recipientSignedAt ??
      (env?.completed_at as string | null) ??
      null;
    const lengthLabel = CONTRACT_LENGTH_LABELS[item.contractLengthKind] ?? item.contractLengthKind;

    documents.push({
      envelopeId: item.envelopeId,
      title: (env?.title as string | null)?.trim() || `${lengthLabel} hire agreement`,
      lengthLabel,
      signedAt,
      pdfUrl: hireSignedDocumentPdfUrl(item.envelopeId),
    });
  }

  return documents;
}
