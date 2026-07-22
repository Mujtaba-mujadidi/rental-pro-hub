import { VEHICLE_HIRE_AGREEMENT_CONTEXT } from "@/lib/esign/adapters/vehicle-hire-agreement";
import { getHireGroupSharedSignatureMode, type HireSignatureMode } from "@/lib/esign/hire-group-signature-mode";
import { getHireGroupIdForEnvelope } from "@/lib/esign/hire-signing-bundle";
import { CONTRACT_LENGTH_LABELS } from "@/lib/fleet/hire-access-display";
import {
  deriveHireEnvelopePreparationStatus,
  hireAgreementsToEnvelopeReadyRows,
  hireEnvelopePreparationLabel,
  type HireAgreementEnvelopeSource,
  type HireEnvelopePreparationStatus,
} from "@/lib/fleet/hire-envelope-readiness";
import { sortHireBundleAgreements } from "@/lib/fleet/hire-signing-bundle";
import type { ContractLengthKind } from "@/lib/fleet/hire-types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type HireEnvelopeDesignerContext = {
  index: number;
  total: number;
  lengthLabel: string;
  vrm: string;
  endDate: string;
  preparationLabel: string;
  /** When set, who-signs was already chosen on another agreement in this hire. */
  sharedSignatureMode: HireSignatureMode | null;
  siblings: {
    index: number;
    lengthLabel: string;
    envelopeId: string | null;
    agreementId: string;
    isCurrent: boolean;
    preparationLabel: string;
  }[];
};

export async function loadHireEnvelopeDesignerContext(
  admin: Admin,
  envelopeId: string,
): Promise<HireEnvelopeDesignerContext | null> {
  const hireGroupId = await getHireGroupIdForEnvelope(admin, envelopeId);
  if (!hireGroupId) return null;

  const { data: env } = await admin
    .from("esign_envelopes")
    .select("context_type, context_id")
    .eq("id", envelopeId.trim())
    .maybeSingle();
  if (env?.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT || !env.context_id) return null;
  const agreementId = env.context_id as string;

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("vehicles(vrm)")
    .eq("id", hireGroupId)
    .maybeSingle();
  const vrm = ((group?.vehicles as { vrm?: string } | null)?.vrm ?? "—").trim() || "—";

  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select(
      "id, contract_length_kind, end_date, esign_envelope_id, esign_envelopes(id, status, field_layout, requires_owner_signature, owner_signed_at, esign_recipients(signed_at))",
    )
    .eq("hire_group_id", hireGroupId);

  const envelopeRows = hireAgreementsToEnvelopeReadyRows((agreements ?? []) as HireAgreementEnvelopeSource[]);
  const envelopeByAgreement = new Map(envelopeRows.map((row) => [row.agreementId, row]));

  const sorted = sortHireBundleAgreements(
    (agreements ?? []).map((a) => ({
      agreementId: a.id as string,
      contractLengthKind: a.contract_length_kind as ContractLengthKind,
      endDate: a.end_date as string,
      envelopeId: (a.esign_envelope_id as string | null) ?? null,
    })),
  );
  if (!sorted.length) return null;

  const preparationForAgreement = (agreementId: string, envelopeId: string | null): HireEnvelopePreparationStatus => {
    const row = envelopeByAgreement.get(agreementId);
    if (!row) return "not_prepared";
    return deriveHireEnvelopePreparationStatus({
      envelopeId: envelopeId ?? row.envelopeId,
      status: row.status,
      requiresOwner: row.requiresOwner,
      ownerSignedAt: row.ownerSignedAt,
      fieldLayout: row.fieldLayout,
      signed: row.signed,
    });
  };

  const currentIdx = Math.max(0, sorted.findIndex((a) => a.agreementId === agreementId));
  const current = sorted[currentIdx]!;
  const sharedSignatureMode = await getHireGroupSharedSignatureMode(admin, hireGroupId);
  const currentPreparation = preparationForAgreement(current.agreementId, current.envelopeId);

  return {
    index: currentIdx + 1,
    total: sorted.length,
    lengthLabel: CONTRACT_LENGTH_LABELS[current.contractLengthKind] ?? current.contractLengthKind,
    vrm,
    endDate: current.endDate,
    preparationLabel: hireEnvelopePreparationLabel(currentPreparation),
    sharedSignatureMode,
    siblings: sorted.map((a, i) => {
      const prep = preparationForAgreement(a.agreementId, a.envelopeId);
      return {
        index: i + 1,
        lengthLabel: CONTRACT_LENGTH_LABELS[a.contractLengthKind] ?? a.contractLengthKind,
        envelopeId: a.envelopeId,
        agreementId: a.agreementId,
        isCurrent: a.agreementId === agreementId,
        preparationLabel: hireEnvelopePreparationLabel(prep),
      };
    }),
  };
}
