/** Rental contract gate: initial sign-off vs established-tenant amendment renewal. */
export function resolveRentalContractAccess(input: {
  contractStatus: string | null | undefined;
  /** `companies.contract_status` — used to recover from brief post-sign inconsistency. */
  companyContractStatus?: string | null | undefined;
  onboardingComplete: boolean;
  hasPendingAmendmentSignature: boolean;
}): { contractActive: boolean; renewalSignaturePending: boolean } {
  const status = (input.contractStatus ?? "").trim();
  const companyStatus = (input.companyContractStatus ?? "").trim();
  const renewalSignaturePending =
    input.hasPendingAmendmentSignature && input.onboardingComplete && status === "draft";
  const recoveredActiveDraft =
    companyStatus === "active" &&
    status === "draft" &&
    input.onboardingComplete &&
    !input.hasPendingAmendmentSignature;
  const contractActive = status === "active" || renewalSignaturePending || recoveredActiveDraft;
  return { contractActive, renewalSignaturePending };
}

/** Hide a rejection banner when a later amendment was signed successfully. */
export function shouldShowContractChangeRejection(
  rejection: { reviewed_at: string | null } | null | undefined,
  lastSignedAt: string | null | undefined,
): boolean {
  if (!rejection?.reviewed_at?.trim()) return false;
  if (!lastSignedAt?.trim()) return true;
  return new Date(lastSignedAt).getTime() < new Date(rejection.reviewed_at).getTime();
}
