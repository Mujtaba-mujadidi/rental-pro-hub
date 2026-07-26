import type { AppProfile } from "@/lib/auth/profile";
import { shouldShowContractChangeRejection } from "@/lib/auth/rental-contract-access";
import {
  mapContractVersionRowToMeta,
  isExecutedPreviousAgreementVersion,
  type RentalContractVersionMeta,
} from "@/lib/companies/contract-version-display";
import {
  resolveContractSignatoryFromSources,
  type ContractSignatoryDefaults,
} from "@/lib/companies/contract-change-signatory";
import { getPendingContractRenewalCached, type PendingContractRenewal } from "@/lib/companies/pending-contract-renewal";
import { createClient } from "@/lib/supabase/server";

export type RentalContractPageData = {
  company: {
    id: string;
    name: string;
    legal_name: string | null;
    company_number: string | null;
    registered_address_line1: string | null;
    registered_address_line2: string | null;
    registered_town: string | null;
    registered_county: string | null;
    registered_postcode: string | null;
    country: string | null;
    primary_contact_first_name: string | null;
    primary_contact_last_name: string | null;
    primary_contact_dob: string | null;
    primary_contact_phone: string | null;
    primary_contact_email: string | null;
    notes: string | null;
    contract_status: string;
    contract_version: number;
  } | null;
  activeVersion: RentalContractVersionMeta | null;
  submittedChange: {
    id: string;
    review_status: string;
    review_comment: string | null;
    transition_type: string;
  } | null;
  lastRejection: {
    review_comment: string | null;
    reviewed_at: string | null;
  } | null;
  serverDraft: {
    id: string;
    transition_type: string;
    proposed_name: string | null;
    proposed_legal_name: string | null;
    proposed_company_number: string | null;
    proposed_registered_address_line1: string | null;
    proposed_registered_address_line2: string | null;
    proposed_registered_town: string | null;
    proposed_registered_county: string | null;
    proposed_registered_postcode: string | null;
    proposed_country: string | null;
    proposed_primary_contact_first_name: string | null;
    proposed_primary_contact_last_name: string | null;
    proposed_primary_contact_dob: string | null;
    proposed_primary_contact_phone: string | null;
    proposed_primary_contact_email: string | null;
    proposed_notes: string | null;
    signatory_name: string | null;
    signatory_email: string | null;
    signatory_title: string | null;
  } | null;
  signatoryDefaults: ContractSignatoryDefaults;
  pendingRenewal: PendingContractRenewal | null;
  previousVersions: RentalContractVersionMeta[];
};

const VERSION_META_COLUMNS =
  "id, version_number, version_status, superseded_at, signed_at, signed_by_customer_at, change_reason, rendered_pdf_storage_path";

const CHANGE_REQUEST_COLUMNS =
  "id, status, created_at, review_status, transition_type, review_comment, reviewed_at, signed_at, proposed_name, proposed_legal_name, proposed_company_number, proposed_registered_address_line1, proposed_registered_address_line2, proposed_registered_town, proposed_registered_county, proposed_registered_postcode, proposed_country, proposed_primary_contact_first_name, proposed_primary_contact_last_name, proposed_primary_contact_dob, proposed_primary_contact_phone, proposed_primary_contact_email, proposed_notes, signatory_name, signatory_email, signatory_title, updated_at";

type ChangeRequestRow = {
  id: string;
  status: string;
  review_status: string;
  transition_type: string;
  review_comment: string | null;
  reviewed_at: string | null;
  signed_at: string | null;
  proposed_name: string | null;
  proposed_legal_name: string | null;
  proposed_company_number: string | null;
  proposed_registered_address_line1: string | null;
  proposed_registered_address_line2: string | null;
  proposed_registered_town: string | null;
  proposed_registered_county: string | null;
  proposed_registered_postcode: string | null;
  proposed_country: string | null;
  proposed_primary_contact_first_name: string | null;
  proposed_primary_contact_last_name: string | null;
  proposed_primary_contact_dob: string | null;
  proposed_primary_contact_phone: string | null;
  proposed_primary_contact_email: string | null;
  proposed_notes: string | null;
  signatory_name: string | null;
  signatory_email: string | null;
  signatory_title: string | null;
};

function pickChangeRequestViews(rows: ChangeRequestRow[]) {
  const submittedChange =
    rows.find((row) => row.status === "pending_signature" && row.review_status !== "rejected") ?? null;
  const lastRejection = rows.find((row) => row.review_status === "rejected") ?? null;
  const lastSignedChange = rows.find((row) => row.status === "signed") ?? null;
  const serverDraft = rows.find((row) => row.status === "draft") ?? null;

  return { submittedChange, lastRejection, lastSignedChange, serverDraft };
}

export async function loadRentalContractPageData(
  profile: AppProfile,
): Promise<RentalContractPageData> {
  const supabase = await createClient();
  const companyId = profile.company_id ?? "";

  const [{ data: company }, { data: changeRows }, { data: contractRow }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_dob, primary_contact_phone, primary_contact_email, notes, contract_status, contract_version",
      )
      .eq("id", companyId)
      .maybeSingle(),
    supabase
      .from("company_contract_change_requests")
      .select(CHANGE_REQUEST_COLUMNS)
      .eq("parent_company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("company_contracts")
      .select("id, current_version_id")
      .eq("parent_company_id", companyId)
      .maybeSingle(),
  ]);

  const { submittedChange, lastRejection, lastSignedChange, serverDraft } = pickChangeRequestViews(
    (changeRows ?? []) as ChangeRequestRow[],
  );

  const contractId = contractRow?.id as string | undefined;
  const cvId = contractRow?.current_version_id as string | undefined;

  const [{ data: activeRow }, { data: expiredRows }, pendingRenewal] = await Promise.all([
    cvId
      ? supabase.from("company_contract_versions").select(VERSION_META_COLUMNS).eq("id", cvId).maybeSingle()
      : Promise.resolve({ data: null }),
    contractId
      ? supabase
          .from("company_contract_versions")
          .select(VERSION_META_COLUMNS)
          .eq("contract_id", contractId)
          .in("version_status", ["superseded", "expired", "terminated"])
          .order("version_number", { ascending: false })
      : Promise.resolve({ data: [] }),
    submittedChange || company?.contract_status === "pending_renewal"
      ? getPendingContractRenewalCached(companyId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const activeVersion = activeRow ? mapContractVersionRowToMeta(activeRow) : null;
  const previousVersions = (expiredRows ?? [])
    .map((row) => mapContractVersionRowToMeta(row))
    .filter(isExecutedPreviousAgreementVersion);

  const visibleRejection = shouldShowContractChangeRejection(
    lastRejection,
    lastSignedChange?.signed_at ?? null,
  )
    ? lastRejection
    : null;

  const signatoryDefaults = resolveContractSignatoryFromSources({
    primaryContactFirstName: company?.primary_contact_first_name,
    primaryContactLastName: company?.primary_contact_last_name,
    primaryContactEmail: company?.primary_contact_email,
  });

  return {
    company: company ?? null,
    activeVersion,
    submittedChange: submittedChange
      ? {
          id: submittedChange.id,
          review_status: submittedChange.review_status,
          review_comment: submittedChange.review_comment,
          transition_type: submittedChange.transition_type,
        }
      : null,
    lastRejection: visibleRejection,
    serverDraft: serverDraft
      ? {
          id: serverDraft.id,
          transition_type: serverDraft.transition_type,
          proposed_name: serverDraft.proposed_name,
          proposed_legal_name: serverDraft.proposed_legal_name,
          proposed_company_number: serverDraft.proposed_company_number,
          proposed_registered_address_line1: serverDraft.proposed_registered_address_line1,
          proposed_registered_address_line2: serverDraft.proposed_registered_address_line2,
          proposed_registered_town: serverDraft.proposed_registered_town,
          proposed_registered_county: serverDraft.proposed_registered_county,
          proposed_registered_postcode: serverDraft.proposed_registered_postcode,
          proposed_country: serverDraft.proposed_country,
          proposed_primary_contact_first_name: serverDraft.proposed_primary_contact_first_name,
          proposed_primary_contact_last_name: serverDraft.proposed_primary_contact_last_name,
          proposed_primary_contact_dob: serverDraft.proposed_primary_contact_dob,
          proposed_primary_contact_phone: serverDraft.proposed_primary_contact_phone,
          proposed_primary_contact_email: serverDraft.proposed_primary_contact_email,
          proposed_notes: serverDraft.proposed_notes,
          signatory_name: serverDraft.signatory_name,
          signatory_email: serverDraft.signatory_email,
          signatory_title: serverDraft.signatory_title,
        }
      : null,
    signatoryDefaults,
    pendingRenewal,
    previousVersions,
  };
}
