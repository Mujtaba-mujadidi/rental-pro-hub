import { hasContractImpactDrift } from "@/lib/rental/subcompany-contract-impact";
import { hireIsEndedForSubcompanyDocumentImpact } from "@/lib/rental/subcompany-hire-document-requirements";
import type { SubcompanyRow } from "@/lib/rental/subcompany";
import type { SubcompanyDocumentKind } from "@/lib/rental/subcompany-workspace-types";

export type AffectedHireDocument = {
  hireGroupId: string;
  agreementId: string | null;
  inspectionId: string | null;
  documentKind: SubcompanyDocumentKind;
  label: string;
};

export type HireForDocumentImpact = {
  id: string;
  status: string;
  issuedAgreementCount: number;
  completedInspectionCount: number;
  subcompany_legal_snapshot: Record<string, unknown> | null;
  vrm: string;
};

export type HireAgreementImpactRow = {
  id: string;
  hire_group_id: string;
  contract_length_kind: string;
  status: string;
  signed_at?: string | null;
  signed_storage_path?: string | null;
  esign_envelope_id?: string | null;
};

type HireInspectionRow = {
  id: string;
  hire_group_id: string;
  kind: "checkout" | "checkin";
  status: string;
};

/** Running hires only — contracts still in draft / signing are excluded. */
export const CONTRACT_IMPACT_HIRE_STATUSES = ["active"] as const;

export function agreementHasIssuedPdf(agreement: {
  signed_at?: string | null;
  signed_storage_path?: string | null;
  esign_envelope_id?: string | null;
}): boolean {
  return Boolean(
    agreement.signed_at?.trim() ||
      agreement.signed_storage_path?.trim() ||
      agreement.esign_envelope_id?.trim(),
  );
}

/**
 * Logo / subcompany detail changes only affect running hires where a driver-facing
 * PDF has already been generated (e-sign envelope) or signed.
 */
export function hireQualifiesForSubcompanyDocumentImpact(hire: {
  status: string;
  issuedAgreementCount: number;
  completedInspectionCount: number;
}): boolean {
  if (hireIsEndedForSubcompanyDocumentImpact(hire.status)) return false;
  if (hire.status !== "active") return false;
  return hire.issuedAgreementCount > 0 || hire.completedInspectionCount > 0;
}

export function mapHireForDocumentImpact(input: {
  id: string;
  status: string;
  subcompany_legal_snapshot?: Record<string, unknown> | null;
  vrm: string;
  agreements: HireAgreementImpactRow[];
  inspections: { status: string }[];
}): HireForDocumentImpact {
  const issuedAgreementCount = input.agreements.filter((row) => agreementHasIssuedPdf(row)).length;
  return {
    id: input.id,
    status: String(input.status ?? ""),
    issuedAgreementCount,
    completedInspectionCount: input.inspections.filter((row) => row.status === "completed").length,
    subcompany_legal_snapshot: input.subcompany_legal_snapshot ?? null,
    vrm: input.vrm,
  };
}

function normalizeRows<T>(raw: T | T[] | null | undefined): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw != null && typeof raw === "object") return [raw];
  return [];
}

function contractLengthLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

export function hireIncludesContractImpact(
  live: SubcompanyRow,
  snapshot: Record<string, unknown> | null | undefined,
): boolean {
  return hasContractImpactDrift(live, snapshot);
}

export function collectAffectedHireDocuments(input: {
  liveSubcompany: SubcompanyRow;
  hires: HireForDocumentImpact[];
  agreements: HireAgreementImpactRow[];
  inspections: HireInspectionRow[];
}): AffectedHireDocument[] {
  const agreementsByHire = new Map<string, HireAgreementImpactRow[]>();
  for (const agreement of input.agreements) {
    const list = agreementsByHire.get(agreement.hire_group_id) ?? [];
    list.push(agreement);
    agreementsByHire.set(agreement.hire_group_id, list);
  }

  const inspectionsByHire = new Map<string, HireInspectionRow[]>();
  for (const inspection of input.inspections) {
    const list = inspectionsByHire.get(inspection.hire_group_id) ?? [];
    list.push(inspection);
    inspectionsByHire.set(inspection.hire_group_id, list);
  }

  const documents: AffectedHireDocument[] = [];

  for (const hire of input.hires) {
    if (!hireQualifiesForSubcompanyDocumentImpact(hire)) continue;

    const snap = hire.subcompany_legal_snapshot ?? {};
    if (!hireIncludesContractImpact(input.liveSubcompany, snap)) continue;

    const vrm = hire.vrm.trim() || "Vehicle";
    const issuedAgreements = (agreementsByHire.get(hire.id) ?? []).filter(
      (agreement) =>
        agreement.status !== "superseded" &&
        agreement.status !== "cancelled" &&
        agreementHasIssuedPdf(agreement),
    );

    for (const agreement of issuedAgreements) {
      documents.push({
        hireGroupId: hire.id,
        agreementId: agreement.id,
        inspectionId: null,
        documentKind: "hire_agreement",
        label: `${vrm} · Hire agreement (${contractLengthLabel(agreement.contract_length_kind)})`,
      });
    }

    if (issuedAgreements.length > 0) {
      documents.push({
        hireGroupId: hire.id,
        agreementId: null,
        inspectionId: null,
        documentKind: "permission_letter",
        label: `${vrm} · Permission letter`,
      });
    }

    for (const inspection of inspectionsByHire.get(hire.id) ?? []) {
      if (inspection.status !== "completed") continue;
      const documentKind: SubcompanyDocumentKind =
        inspection.kind === "checkout" ? "inspection_checkout" : "inspection_checkin";
      const reportLabel = inspection.kind === "checkout" ? "Vehicle checkout report" : "Vehicle check-in report";
      documents.push({
        hireGroupId: hire.id,
        agreementId: null,
        inspectionId: inspection.id,
        documentKind,
        label: `${vrm} · ${reportLabel}`,
      });
    }
  }

  return documents;
}

export function affectedHireDocumentKey(doc: {
  hireGroupId: string;
  documentKind: string;
  agreementId?: string | null;
  inspectionId?: string | null;
}): string {
  return [doc.hireGroupId, doc.documentKind, doc.agreementId ?? "", doc.inspectionId ?? ""].join(":");
}

export function resolveHireVrm(vehicles: unknown): string {
  const row = normalizeRows(vehicles as { vrm?: string } | { vrm?: string }[] | null)[0];
  return row?.vrm?.trim() || "Vehicle";
}
