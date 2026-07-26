import {
  proposedSnapshotFromChangeRequest,
  type ContractChangeFieldSnapshot,
} from "@/lib/companies/contract-change-diff";
import {
  isIncompleteRenewalDraftVersion,
  maxCountedContractVersionNumber,
  nextContractVersionNumber,
} from "@/lib/companies/contract-version-display";
import {
  loadParentCompanyOwnerContact,
  resolveContractSignatoryFromSources,
} from "@/lib/companies/contract-change-signatory";
import { syncPlatformContractRecipientName } from "@/lib/esign/recipient-prefill";
import { buildPlatformContractEnvelopeFromCurrentVersion } from "@/lib/esign/adapters/platform-company-contract";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

type ChangeRequestRow = {
  id: string;
  parent_company_id: string;
  status: string;
  review_status: string;
  transition_type: string;
  proposed_name: string;
  proposed_legal_name: string | null;
  proposed_company_number: string | null;
  proposed_registered_address_line1: string | null;
  proposed_registered_address_line2: string | null;
  proposed_registered_town: string | null;
  proposed_registered_county: string | null;
  proposed_registered_postcode: string | null;
  proposed_country: string;
  proposed_primary_contact_first_name: string;
  proposed_primary_contact_last_name: string;
  proposed_primary_contact_dob: string;
  proposed_primary_contact_phone: string;
  proposed_primary_contact_email: string;
  proposed_notes: string | null;
  signatory_name: string | null;
  signatory_email: string | null;
  signatory_title: string | null;
  esign_envelope_id: string | null;
};

function legalSnapshotFromProposed(request: ChangeRequestRow): Record<string, unknown> {
  const snapshot = proposedSnapshotFromChangeRequest(request);
  return {
    name: snapshot.name,
    legal_name: snapshot.legal_name,
    company_number: snapshot.company_number,
    registered_address_line1: snapshot.registered_address_line1,
    registered_address_line2: snapshot.registered_address_line2,
    registered_town: snapshot.registered_town,
    registered_county: snapshot.registered_county,
    registered_postcode: snapshot.registered_postcode,
    country: snapshot.country,
    primary_contact_first_name: snapshot.primary_contact_first_name,
    primary_contact_last_name: snapshot.primary_contact_last_name,
    primary_contact_dob: snapshot.primary_contact_dob,
    primary_contact_phone: snapshot.primary_contact_phone,
    primary_contact_email: snapshot.primary_contact_email,
    notes: snapshot.notes,
  };
}

function resolveSignatory(
  request: ChangeRequestRow,
  company: {
    primary_contact_email: string | null;
    primary_contact_first_name: string | null;
    primary_contact_last_name: string | null;
  },
  owner: { displayName: string | null; email: string | null },
): { email: string; name: string | null } {
  const resolved = resolveContractSignatoryFromSources({
    signatoryName: request.signatory_name,
    signatoryEmail: request.signatory_email,
    ownerDisplayName: owner.displayName,
    ownerEmail: owner.email,
    primaryContactFirstName: request.proposed_primary_contact_first_name ?? company.primary_contact_first_name,
    primaryContactLastName: request.proposed_primary_contact_last_name ?? company.primary_contact_last_name,
    primaryContactEmail: request.proposed_primary_contact_email ?? company.primary_contact_email,
  });
  return { email: resolved.email, name: resolved.name || null };
}

async function loadChangeRequest(admin: Admin, changeRequestId: string): Promise<ChangeRequestRow | null> {
  const { data, error } = await admin
    .from("company_contract_change_requests")
    .select(
      "id, parent_company_id, status, review_status, transition_type, proposed_name, proposed_legal_name, proposed_company_number, proposed_registered_address_line1, proposed_registered_address_line2, proposed_registered_town, proposed_registered_county, proposed_registered_postcode, proposed_country, proposed_primary_contact_first_name, proposed_primary_contact_last_name, proposed_primary_contact_dob, proposed_primary_contact_phone, proposed_primary_contact_email, proposed_notes, signatory_name, signatory_email, signatory_title, esign_envelope_id",
    )
    .eq("id", changeRequestId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ChangeRequestRow;
}

/** Create a draft renewal contract version from an approved change request. */
export async function createDraftRenewalVersionForChangeRequest(
  admin: Admin,
  changeRequestId: string,
  createdBy: string,
): Promise<{ ok: true; versionId: string; contractId: string } | { ok: false; error: string }> {
  const request = await loadChangeRequest(admin, changeRequestId);
  if (!request) return { ok: false, error: "Change request not found." };
  if (request.status !== "pending_signature") return { ok: false, error: "Change request is not open." };
  if (request.transition_type !== "detail_change") {
    return { ok: false, error: "Only in-place legal detail changes use the renewal contract flow." };
  }
  if (!["pending_review", "awaiting_signature", "approved"].includes(request.review_status)) {
    return { ok: false, error: "Change request is not ready for renewal contract preparation." };
  }

  const { data: contract, error: contractErr } = await admin
    .from("company_contracts")
    .select("id, current_version_id")
    .eq("parent_company_id", request.parent_company_id)
    .maybeSingle();
  if (contractErr || !contract?.id) return { ok: false, error: contractErr?.message ?? "Contract not found." };

  const { data: linkedVersions } = await admin
    .from("company_contract_versions")
    .select(
      "id, version_status, version_number, signed_at, signed_by_customer_at, rendered_pdf_storage_path, change_reason",
    )
    .eq("change_request_id", changeRequestId)
    .order("version_number", { ascending: false });

  const reusableDraft = (linkedVersions ?? []).find((row) =>
    isIncompleteRenewalDraftVersion({
      versionNumber: row.version_number as number,
      versionStatus: row.version_status as string,
      signedByCustomerAt: row.signed_by_customer_at as string | null,
      signedAt: row.signed_at as string | null,
      hasPdf: Boolean((row.rendered_pdf_storage_path as string | null)?.trim()),
      changeReason: row.change_reason as string | null,
    }),
  );

  if (reusableDraft?.id) {
    const legalSnapshot = legalSnapshotFromProposed(request);
    const { error: reuseErr } = await admin
      .from("company_contract_versions")
      .update({
        snapshot: legalSnapshot,
        legal_snapshot: legalSnapshot,
        version_status: "draft",
        superseded_at: null,
        sent_for_signature_at: null,
        countersigned_at: null,
        signed_at: null,
        signed_by_customer_at: null,
        rendered_pdf_storage_path: null,
      })
      .eq("id", reusableDraft.id);
    if (reuseErr) return { ok: false, error: reuseErr.message };

    const { error: contractUpErr } = await admin
      .from("company_contracts")
      .update({ current_version_id: reusableDraft.id, status: "draft" })
      .eq("id", contract.id);
    if (contractUpErr) return { ok: false, error: contractUpErr.message };

    return { ok: true, versionId: reusableDraft.id as string, contractId: contract.id };
  }

  const { data: activeVersion, error: activeVersionErr } = await admin
    .from("company_contract_versions")
    .select("id, version_number, terms_snapshot, commercial_snapshot, pricing_snapshot, terms_catalog_version_id")
    .eq("contract_id", contract.id)
    .eq("version_status", "active")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeVersionErr || !activeVersion?.id) {
    return { ok: false, error: activeVersionErr?.message ?? "Active contract version not found." };
  }

  const { data: versionRows, error: versionsErr } = await admin
    .from("company_contract_versions")
    .select("version_number, version_status, signed_at, signed_by_customer_at, rendered_pdf_storage_path, change_reason")
    .eq("contract_id", contract.id);
  if (versionsErr) return { ok: false, error: versionsErr.message };

  const nextVersion = nextContractVersionNumber(
    maxCountedContractVersionNumber(
      (versionRows ?? []).map((row) => ({
        versionNumber: row.version_number as number,
        versionStatus: row.version_status as string,
        signedByCustomerAt: row.signed_by_customer_at as string | null,
        signedAt: row.signed_at as string | null,
        hasPdf: Boolean((row.rendered_pdf_storage_path as string | null)?.trim()),
        changeReason: row.change_reason as string | null,
      })),
    ),
  );
  const legalSnapshot = legalSnapshotFromProposed(request);

  const { data: newVersion, error: insertErr } = await admin
    .from("company_contract_versions")
    .insert({
      contract_id: contract.id,
      version_number: nextVersion,
      snapshot: legalSnapshot,
      legal_snapshot: legalSnapshot,
      commercial_snapshot: activeVersion.commercial_snapshot ?? {},
      pricing_snapshot: activeVersion.pricing_snapshot ?? {},
      terms_snapshot: activeVersion.terms_snapshot ?? {},
      terms_catalog_version_id: activeVersion.terms_catalog_version_id ?? null,
      version_status: "draft",
      change_reason: "Legal detail change — pending customer signature",
      change_request_id: changeRequestId,
      created_by: createdBy,
      signed_at: null,
      signed_by_customer_at: null,
      rendered_pdf_storage_path: null,
    })
    .select("id")
    .single();
  if (insertErr || !newVersion?.id) return { ok: false, error: insertErr?.message ?? "Could not create draft version." };

  const { error: contractUpErr } = await admin
    .from("company_contracts")
    .update({ current_version_id: newVersion.id, status: "draft" })
    .eq("id", contract.id);
  if (contractUpErr) return { ok: false, error: contractUpErr.message };

  return { ok: true, versionId: newVersion.id, contractId: contract.id };
}

/** Prepare draft renewal version and e-sign envelope for a reviewed change request. */
export async function prepareContractChangeRenewalEsign(
  admin: Admin,
  changeRequestId: string,
  createdBy: string,
): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
  const request = await loadChangeRequest(admin, changeRequestId);
  if (!request) return { ok: false, error: "Change request not found." };
  if (request.esign_envelope_id) {
    const { data: env } = await admin
      .from("esign_envelopes")
      .select("id, status")
      .eq("id", request.esign_envelope_id)
      .maybeSingle();
    if (env?.id && env.status !== "void" && env.status !== "completed") {
      return { ok: true, envelopeId: env.id };
    }
  }

  const draft = await createDraftRenewalVersionForChangeRequest(admin, changeRequestId, createdBy);
  if (!draft.ok) return draft;

  const { data: company, error: companyErr } = await admin
    .from("companies")
    .select("primary_contact_email, primary_contact_first_name, primary_contact_last_name")
    .eq("id", request.parent_company_id)
    .maybeSingle();
  if (companyErr || !company) return { ok: false, error: companyErr?.message ?? "Company not found." };

  const owner = await loadParentCompanyOwnerContact(admin, request.parent_company_id);
  const signatory = resolveSignatory(request, company, owner);
  if (!signatory.email) {
    return { ok: false, error: "A signatory email is required before sending the renewal contract." };
  }

  if (!request.signatory_name?.trim() || !request.signatory_email?.trim()) {
    await admin
      .from("company_contract_change_requests")
      .update({
        signatory_name: signatory.name,
        signatory_email: signatory.email,
      })
      .eq("id", changeRequestId);
  }

  const prepared = await buildPlatformContractEnvelopeFromCurrentVersion(admin, request.parent_company_id, createdBy, {
    signatoryEmail: signatory.email,
    signatoryName: signatory.name,
  });
  if (!prepared.ok) return prepared;

  await syncPlatformContractRecipientName(admin, prepared.envelopeId, signatory.name);

  await admin
    .from("company_contract_change_requests")
    .update({
      esign_envelope_id: prepared.envelopeId,
      review_status: "awaiting_signature",
    })
    .eq("id", changeRequestId);

  return prepared;
}

/** Apply proposed legal data after the renewal contract is signed. */
export async function finalizeContractChangeAfterEsign(
  admin: Admin,
  changeRequestId: string,
  signedBy: string | null,
): Promise<void> {
  const request = await loadChangeRequest(admin, changeRequestId);
  if (!request || request.status !== "pending_signature") return;

  const { data: primarySubcompany } = await admin
    .from("subcompanies")
    .select("id")
    .eq("parent_company_id", request.parent_company_id)
    .eq("is_primary", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const proposed = proposedSnapshotFromChangeRequest(request);
  const { data: companyRow } = await admin
    .from("companies")
    .select("contract_version")
    .eq("id", request.parent_company_id)
    .maybeSingle();

  await admin
    .from("companies")
    .update({
      name: proposed.name,
      legal_name: proposed.legal_name,
      company_number: proposed.company_number,
      registered_address_line1: proposed.registered_address_line1,
      registered_address_line2: proposed.registered_address_line2,
      registered_town: proposed.registered_town,
      registered_county: proposed.registered_county,
      registered_postcode: proposed.registered_postcode,
      country: proposed.country,
      primary_contact_first_name: proposed.primary_contact_first_name,
      primary_contact_last_name: proposed.primary_contact_last_name,
      primary_contact_dob: proposed.primary_contact_dob,
      primary_contact_phone: proposed.primary_contact_phone,
      primary_contact_email: proposed.primary_contact_email,
      notes: proposed.notes,
      contract_status: "active",
      contract_version: (companyRow?.contract_version ?? 1) + 1,
    })
    .eq("id", request.parent_company_id);

  if (primarySubcompany?.id) {
    await admin
      .from("subcompanies")
      .update({
        name: proposed.name,
        primary_contact_first_name: proposed.primary_contact_first_name,
        primary_contact_last_name: proposed.primary_contact_last_name,
        primary_contact_dob: proposed.primary_contact_dob,
        primary_contact_phone: proposed.primary_contact_phone,
        primary_contact_email: proposed.primary_contact_email,
      })
      .eq("id", primarySubcompany.id);
  }

  const { data: contract } = await admin
    .from("company_contracts")
    .select("id, current_version_id")
    .eq("parent_company_id", request.parent_company_id)
    .maybeSingle();

  if (contract?.current_version_id) {
    await admin
      .from("company_contract_versions")
      .update({ version_status: "superseded", superseded_at: new Date().toISOString() })
      .eq("contract_id", contract.id)
      .eq("version_status", "active")
      .neq("id", contract.current_version_id);
  }

  await admin
    .from("company_contract_change_requests")
    .update({
      status: "signed",
      review_status: "completed",
      signed_at: new Date().toISOString(),
      signed_by: signedBy,
      contract_id: contract?.id ?? null,
    })
    .eq("id", changeRequestId);
}

export type { ContractChangeFieldSnapshot };
