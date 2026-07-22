import { sortHireBundleAgreements } from "@/lib/fleet/hire-signing-bundle";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import type { ContractLengthKind } from "@/lib/fleet/hire-types";

export type HireAgreementEnvelopeSource = {
  id?: string;
  status?: string;
  contract_length_kind?: ContractLengthKind | string;
  end_date?: string;
  esign_envelope_id?: string | null;
  esign_envelopes?: {
    id?: string;
    status?: string;
    field_layout?: EsignFieldLayoutItem[];
    requires_owner_signature?: boolean;
    owner_signed_at?: string | null;
    esign_recipients?: { signed_at?: string | null }[];
  } | null;
};

export type HireEnvelopeReadyRow = {
  agreementId: string;
  contractLengthKind: ContractLengthKind;
  endDate: string;
  envelopeId: string;
  status: string;
  requiresOwner: boolean;
  ownerSignedAt: string | null;
  fieldLayout: EsignFieldLayoutItem[];
  signed: boolean;
};

export type HireEnvelopePreparationStatus =
  | "not_prepared"
  | "choose_signing"
  | "awaiting_lessor"
  | "lessor_signed"
  | "ready_to_send"
  | "awaiting_hirer"
  | "hirer_signed";

const HIRE_ENVELOPE_PREPARATION_LABELS: Record<HireEnvelopePreparationStatus, string> = {
  not_prepared: "Not prepared",
  choose_signing: "Choose who signs",
  awaiting_lessor: "Awaiting lessor",
  lessor_signed: "Lessor signed",
  ready_to_send: "Ready to send",
  awaiting_hirer: "Awaiting hirer",
  hirer_signed: "Hirer signed",
};

export function deriveHireEnvelopePreparationStatus(input: {
  envelopeId: string | null;
  status: string;
  requiresOwner: boolean;
  ownerSignedAt: string | null;
  fieldLayout: EsignFieldLayoutItem[];
  signed: boolean;
}): HireEnvelopePreparationStatus {
  if (!input.envelopeId) return "not_prepared";
  if (input.signed || input.status === "completed") return "hirer_signed";
  if (input.status === "sent" || input.status === "viewed") return "awaiting_hirer";

  const hasLayout = Array.isArray(input.fieldLayout) && input.fieldLayout.length > 0;
  if (!hasLayout) return "choose_signing";

  if (input.requiresOwner) {
    if (!input.ownerSignedAt) return "awaiting_lessor";
    return "lessor_signed";
  }

  return "ready_to_send";
}

export function hireEnvelopePreparationLabel(status: HireEnvelopePreparationStatus): string {
  return HIRE_ENVELOPE_PREPARATION_LABELS[status];
}

export function hireAgreementsToEnvelopeReadyRows(
  agreements: HireAgreementEnvelopeSource[],
): HireEnvelopeReadyRow[] {
  const rows = agreements
    .map((row) => {
      const env = row.esign_envelopes;
      const envelopeId = (env?.id ?? row.esign_envelope_id) as string | undefined;
      if (!envelopeId || !row.id) return null;
      const signed = Boolean(env?.esign_recipients?.[0]?.signed_at) || env?.status === "completed";
      return {
        agreementId: row.id,
        contractLengthKind: row.contract_length_kind as ContractLengthKind,
        endDate: (row.end_date as string) ?? "",
        envelopeId,
        status: (env?.status as string) ?? "draft",
        requiresOwner: env?.requires_owner_signature !== false,
        ownerSignedAt: (env?.owner_signed_at as string | null) ?? null,
        fieldLayout: (env?.field_layout ?? []) as EsignFieldLayoutItem[],
        signed,
      };
    })
    .filter(Boolean) as HireEnvelopeReadyRow[];

  return sortHireBundleAgreements(rows);
}

/** First envelope staff should open to continue preparing the signing bundle. */
export function pickPrepareEnvelopeId(rows: HireEnvelopeReadyRow[]): string | null {
  const unsigned = rows.filter((r) => !r.signed);
  const prep =
    unsigned.find((r) => r.status === "draft" || r.status === "awaiting_placement") ??
    unsigned.find((r) => r.requiresOwner && !r.ownerSignedAt && r.status !== "sent" && r.status !== "viewed") ??
    unsigned[0];
  return prep?.envelopeId ?? rows[0]?.envelopeId ?? null;
}
