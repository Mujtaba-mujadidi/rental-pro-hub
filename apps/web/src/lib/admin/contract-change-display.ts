export const ADMIN_AGREEMENT_CHANGE_REQUESTS_NAV = "Agreement change requests";

/** Query param on `/super-admin/esign/[id]` so Back returns to agreement change requests. */
export const SUPER_ADMIN_ESIGN_FROM_AGREEMENT_CHANGES = "agreement-changes";

export function superAdminEsignDesignerHref(envelopeId: string, fromAgreementChanges = false): string {
  const base = `/super-admin/esign/${envelopeId}`;
  return fromAgreementChanges
    ? `${base}?from=${SUPER_ADMIN_ESIGN_FROM_AGREEMENT_CHANGES}`
    : base;
}

export function superAdminEsignDesignerBack(from: string | null | undefined): {
  backHref: string;
  backLabel: string;
} {
  if (from === SUPER_ADMIN_ESIGN_FROM_AGREEMENT_CHANGES) {
    return {
      backHref: "/super-admin/contract-changes",
      backLabel: ADMIN_AGREEMENT_CHANGE_REQUESTS_NAV,
    };
  }
  return { backHref: "/super-admin/companies", backLabel: "Companies" };
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  awaiting_signature: "Awaiting signature",
  completed: "Completed",
  draft: "Draft",
};

export function formatContractChangeReviewStatus(status: string | null | undefined): string {
  const key = (status ?? "").trim();
  if (!key) return "Unknown";
  return REVIEW_STATUS_LABELS[key] ?? key.replaceAll("_", " ");
}

export function formatContractChangeTransitionType(type: string | null | undefined): string {
  if (type === "new_legal_entity") return "New legal entity";
  return "Legal detail change";
}

export type ContractChangeHistoryRow = {
  id: string;
  created_at: string;
  status: string;
  review_status: string;
  reviewed_at: string | null;
  review_comment: string | null;
  signed_at: string | null;
  transition_type: string;
};

export type ContractChangeHistoryEvent = {
  at: string;
  label: string;
  detail?: string | null;
};

export function buildContractChangeHistoryEvents(row: ContractChangeHistoryRow): ContractChangeHistoryEvent[] {
  const events: ContractChangeHistoryEvent[] = [
    {
      at: row.created_at,
      label: "Request submitted",
      detail: formatContractChangeTransitionType(row.transition_type),
    },
  ];

  if (row.reviewed_at && row.review_status === "rejected") {
    events.push({
      at: row.reviewed_at,
      label: "Rejected by platform",
      detail: row.review_comment,
    });
  } else if (
    row.reviewed_at &&
    (row.review_status === "approved" ||
      row.review_status === "awaiting_signature" ||
      row.review_status === "completed")
  ) {
    events.push({
      at: row.reviewed_at,
      label: "Approved by platform",
    });
  }

  if (row.review_status === "awaiting_signature" && row.status === "pending_signature" && !row.signed_at) {
    events.push({
      at: row.reviewed_at ?? row.created_at,
      label: "Awaiting customer signature",
    });
  }

  if (row.signed_at || row.status === "signed" || row.review_status === "completed") {
    events.push({
      at: row.signed_at ?? row.reviewed_at ?? row.created_at,
      label: "Signed and executed",
    });
  }

  return events;
}
