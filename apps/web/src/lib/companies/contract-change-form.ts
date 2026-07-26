import {
  buildContractChangeDiff,
  companySnapshotForChangeDiff,
  contractChangeDiffHasChanges,
  contractChangeDiffHasDisplayChanges,
  contractChangeDiffHasFormattingOnlyChanges,
  type ContractChangeFieldSnapshot,
} from "@/lib/companies/contract-change-diff";

export type ContractChangeTransitionType = "detail_change" | "new_legal_entity";

export type ParsedContractChangeForm = {
  transition_type: ContractChangeTransitionType;
  /** Normalised values for persistence (e.g. compact UK postcode). */
  proposed: ContractChangeFieldSnapshot;
  /** Raw form values for diff / formatting-only detection. */
  proposedForDiff: ContractChangeFieldSnapshot;
  signatory_name: string | null;
  signatory_email: string | null;
  signatory_title: string | null;
};

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function parseContractChangeFormData(
  formData: FormData,
): { ok: true; data: ParsedContractChangeForm } | { ok: false; error: string } {
  const name = nullIfEmpty(formData.get("name"));
  const firstName = nullIfEmpty(formData.get("primary_contact_first_name"));
  const lastName = nullIfEmpty(formData.get("primary_contact_last_name"));
  const contactEmail = nullIfEmpty(formData.get("primary_contact_email"));
  const contactPhone = nullIfEmpty(formData.get("primary_contact_phone"));
  const dobRaw = nullIfEmpty(formData.get("primary_contact_dob"));

  if (!name) return { ok: false, error: "Company name is required." };
  if (!firstName) return { ok: false, error: "Primary contact first name is required." };
  if (!lastName) return { ok: false, error: "Primary contact last name is required." };
  if (!contactEmail) return { ok: false, error: "Primary contact email is required." };
  if (!contactPhone) return { ok: false, error: "Primary contact phone is required." };
  if (!dobRaw) return { ok: false, error: "Primary contact date of birth is required." };

  let dob: string;
  try {
    const d = new Date(dobRaw);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date of birth." };
    dob = d.toISOString().slice(0, 10);
  } catch {
    return { ok: false, error: "Invalid date of birth." };
  }

  const transitionRaw = nullIfEmpty(formData.get("transition_type")) ?? "detail_change";
  const transition_type: ContractChangeTransitionType =
    transitionRaw === "new_legal_entity" ? "new_legal_entity" : "detail_change";

  const postcodeRaw = nullIfEmpty(formData.get("registered_postcode"));
  const registeredPostcode = postcodeRaw ? postcodeRaw.trim().toUpperCase().replace(/\s+/g, "") : null;
  const postcodeForDiff = postcodeRaw ? postcodeRaw.trim() : null;

  const proposedFields = {
    name,
    legal_name: nullIfEmpty(formData.get("legal_name")),
    company_number: nullIfEmpty(formData.get("company_number")),
    registered_address_line1: nullIfEmpty(formData.get("registered_address_line1")),
    registered_address_line2: nullIfEmpty(formData.get("registered_address_line2")),
    registered_town: nullIfEmpty(formData.get("registered_town")),
    registered_county: nullIfEmpty(formData.get("registered_county")),
    registered_postcode: registeredPostcode,
    country: nullIfEmpty(formData.get("country")) ?? "GB",
    primary_contact_first_name: firstName,
    primary_contact_last_name: lastName,
    primary_contact_dob: dob,
    primary_contact_phone: contactPhone,
    primary_contact_email: contactEmail,
    notes: nullIfEmpty(formData.get("notes")),
  };

  return {
    ok: true,
    data: {
      transition_type,
      proposed: proposedFields,
      proposedForDiff: {
        ...proposedFields,
        registered_postcode: postcodeForDiff,
      },
      signatory_name: nullIfEmpty(formData.get("signatory_name")),
      signatory_email: nullIfEmpty(formData.get("signatory_email")),
      signatory_title: nullIfEmpty(formData.get("signatory_title")),
    },
  };
}

export function assertContractChangeHasDisplayChanges(
  current: ContractChangeFieldSnapshot,
  proposed: ContractChangeFieldSnapshot,
): { ok: true } | { ok: false; error: string } {
  const diff = buildContractChangeDiff(current, proposed);
  if (!contractChangeDiffHasDisplayChanges(diff)) {
    return {
      ok: false,
      error: "No changes detected compared with your current record. Update at least one field before saving.",
    };
  }
  return { ok: true };
}

/** @deprecated Use assertContractChangeHasDisplayChanges — kept for callers that only care about substantive edits. */
export function assertContractChangeHasSubstantiveChanges(
  current: ContractChangeFieldSnapshot,
  proposed: ContractChangeFieldSnapshot,
): { ok: true } | { ok: false; error: string } {
  const diff = buildContractChangeDiff(current, proposed);
  if (!contractChangeDiffHasChanges(diff)) {
    return {
      ok: false,
      error:
        "No legal details changed compared with your current record. Update at least one field before saving (postcode spacing alone does not count as a change).",
    };
  }
  return { ok: true };
}

export function contractChangeRequiresFormattingConfirm(
  current: ContractChangeFieldSnapshot,
  proposed: ContractChangeFieldSnapshot,
): boolean {
  const diff = buildContractChangeDiff(current, proposed);
  return contractChangeDiffHasFormattingOnlyChanges(diff) && !contractChangeDiffHasChanges(diff);
}

/** Formatting-only edits can be saved to the company record without a contract renewal. */
export function assertContractChangeIsFormattingOnly(
  current: ContractChangeFieldSnapshot,
  proposed: ContractChangeFieldSnapshot,
): { ok: true } | { ok: false; error: string } {
  const diff = buildContractChangeDiff(companySnapshotForChangeDiff(current), proposed);
  if (!contractChangeDiffHasDisplayChanges(diff)) {
    return {
      ok: false,
      error: "No changes detected compared with your current record. Update at least one field before saving.",
    };
  }
  if (contractChangeDiffHasChanges(diff)) {
    return {
      ok: false,
      error: "These changes affect legal details on your contract. Submit for platform review instead.",
    };
  }
  return { ok: true };
}

export function contractChangeRequestRowFromParsed(
  parentCompanyId: string,
  requestedBy: string,
  parsed: ParsedContractChangeForm,
  status: "draft" | "pending_signature",
  reviewStatus: "draft" | "pending_review",
) {
  const { proposed, transition_type } = parsed;
  return {
    parent_company_id: parentCompanyId,
    requested_by: requestedBy,
    status,
    review_status: reviewStatus,
    transition_type,
    proposed_name: proposed.name,
    proposed_legal_name: proposed.legal_name,
    proposed_company_number: proposed.company_number,
    proposed_registered_address_line1: proposed.registered_address_line1,
    proposed_registered_address_line2: proposed.registered_address_line2,
    proposed_registered_town: proposed.registered_town,
    proposed_registered_county: proposed.registered_county,
    proposed_registered_postcode: proposed.registered_postcode,
    proposed_country: proposed.country,
    proposed_primary_contact_first_name: proposed.primary_contact_first_name,
    proposed_primary_contact_last_name: proposed.primary_contact_last_name,
    proposed_primary_contact_dob: proposed.primary_contact_dob,
    proposed_primary_contact_phone: proposed.primary_contact_phone,
    proposed_primary_contact_email: proposed.primary_contact_email,
    proposed_notes: proposed.notes,
    signatory_name: parsed.signatory_name,
    signatory_email: parsed.signatory_email,
    signatory_title: parsed.signatory_title,
  };
}
