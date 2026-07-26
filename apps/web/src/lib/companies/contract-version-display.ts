export type RentalContractVersionMeta = {
  id: string;
  versionNumber: number;
  versionStatus: string;
  supersededAt: string | null;
  signedAt: string | null;
  signedByCustomerAt: string | null;
  changeReason: string | null;
  hasPdf: boolean;
};

const VERSION_STATUS_LABELS: Record<string, string> = {
  superseded: "Superseded",
  expired: "Expired",
  terminated: "Terminated",
  legacy_import: "Legacy",
  active: "Active",
};

export function formatContractVersionStatus(status: string | null | undefined): string {
  const key = (status ?? "").trim();
  if (!key) return "Unknown";
  return VERSION_STATUS_LABELS[key] ?? key.replaceAll("_", " ");
}

export function platformAgreementPdfFileName(versionNumber: number): string {
  return `platform-agreement-v${versionNumber}.pdf`;
}

export function isPendingCustomerSignatureChangeReason(reason: string | null | undefined): boolean {
  return (reason ?? "").trim().toLowerCase().includes("pending customer signature");
}

type ContractVersionCountInput = {
  versionNumber: number;
  versionStatus?: string | null;
  signedByCustomerAt?: string | null;
  signedAt?: string | null;
  hasPdf?: boolean;
  changeReason?: string | null;
};

/** In-prep renewal rows (owner may have signed) that never completed customer execution. */
export function isIncompleteRenewalDraftVersion(version: ContractVersionCountInput): boolean {
  if (version.signedByCustomerAt?.trim()) return false;
  if (version.hasPdf) return false;
  if (isPendingCustomerSignatureChangeReason(version.changeReason)) return true;

  const status = (version.versionStatus ?? "").trim();
  return ["draft", "sent_for_signature", "viewed", "signed_by_customer"].includes(status);
}

/** Next version number — ignores abandoned in-prep renewal drafts. */
export function nextContractVersionNumber(maxCountedVersion: number | null | undefined): number {
  return (maxCountedVersion ?? 0) + 1;
}

export function maxCountedContractVersionNumber(versions: ContractVersionCountInput[]): number {
  let max = 0;
  for (const version of versions) {
    if (isIncompleteRenewalDraftVersion(version)) continue;
    max = Math.max(max, version.versionNumber);
  }
  return max;
}

/** Previous agreements tab: only fully executed versions with a stored final PDF. */
export function isExecutedPreviousAgreementVersion(version: RentalContractVersionMeta): boolean {
  if (isIncompleteRenewalDraftVersion(version)) {
    return false;
  }

  if (version.signedByCustomerAt?.trim() && version.hasPdf) {
    return true;
  }

  // Legacy rows may only have signed_at + rendered PDF (before signed_by_customer_at existed).
  return Boolean(version.signedAt?.trim() && version.hasPdf);
}

export function mapContractVersionRowToMeta(row: {
  id: string;
  version_number: number;
  version_status: string;
  superseded_at?: string | null;
  signed_at?: string | null;
  signed_by_customer_at?: string | null;
  change_reason?: string | null;
  rendered_pdf_storage_path?: string | null;
}): RentalContractVersionMeta {
  return {
    id: row.id,
    versionNumber: row.version_number,
    versionStatus: row.version_status ?? "unknown",
    supersededAt: row.superseded_at ?? null,
    signedAt: row.signed_at ?? null,
    signedByCustomerAt: row.signed_by_customer_at ?? null,
    changeReason: row.change_reason ?? null,
    hasPdf: Boolean(row.rendered_pdf_storage_path?.trim()),
  };
}
