import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { HIRE_ACCESS_VEHICLE_SELECT } from "@/lib/fleet/hire-access-vehicle-fields";

export type HireAccessTermsPreview = {
  title: string;
  body: string;
  versionLabel: string | null;
};

const HIRE_GROUP_DETAIL_SELECT =
  `hire_terms_version_id, start_date, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, draft_snapshot, companies(name), vehicles(${HIRE_ACCESS_VEHICLE_SELECT}), subcompanies(legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode), company_hire_terms_versions(title, body, version_label)`;

export function hireAccessSnapshotIsSparse(snapshot: Record<string, unknown>): boolean {
  return (
    !snapshot.start_date &&
    snapshot.rent_amount_gbp == null &&
    !snapshot.vehicles &&
    !snapshot.companies
  );
}

/** Full hire preview payload stored on driver access requests. */
export async function loadHireGroupAccessSnapshot(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  hireGroupId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("vehicle_hire_groups")
    .select(HIRE_GROUP_DETAIL_SELECT)
    .eq("id", hireGroupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

function snapshotIsSparse(snapshot: Record<string, unknown>): boolean {
  return hireAccessSnapshotIsSparse(snapshot);
}

export async function enrichHireAccessSnapshot(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  hireSummary: Record<string, unknown>,
  hireGroupId: string | null,
  parentCompanyId?: string | null,
  options?: { includeTerms?: boolean },
): Promise<{
  hireSummary: Record<string, unknown>;
  termsPreview: HireAccessTermsPreview | null;
  companyName: string | null;
}> {
  const includeTerms = options?.includeTerms !== false;
  let summary =
    snapshotIsSparse(hireSummary) && hireGroupId
      ? {}
      : { ...hireSummary };
  let termsPreview: HireAccessTermsPreview | null = null;

  const embeddedTerms = summary.company_hire_terms_versions as
    | { title?: string; body?: string; version_label?: string }
    | undefined;
  if (embeddedTerms?.title && embeddedTerms?.body) {
    termsPreview = {
      title: embeddedTerms.title,
      body: embeddedTerms.body,
      versionLabel: embeddedTerms.version_label ?? null,
    };
  }

  let companyName = (summary.companies as { name?: string } | undefined)?.name?.trim() || null;
  if (!companyName && parentCompanyId) {
    const { data: company } = await admin.from("companies").select("name").eq("id", parentCompanyId).maybeSingle();
    companyName = company?.name?.trim() || null;
    if (companyName) summary = { ...summary, companies: { name: companyName } };
  }

  if (!hireGroupId) return { hireSummary: summary, termsPreview, companyName };

  const { data: hg } = await admin
    .from("vehicle_hire_groups")
    .select(HIRE_GROUP_DETAIL_SELECT)
    .eq("id", hireGroupId)
    .maybeSingle();

  if (!hg) return { hireSummary: summary, termsPreview, companyName };

  if (snapshotIsSparse(hireSummary)) {
    summary = { ...(hg as Record<string, unknown>) };
  } else {
    for (const key of [
      "start_date",
      "rent_cadence",
      "rent_amount_gbp",
      "deposit_gbp",
      "include_deposit",
      "draft_snapshot",
      "companies",
      "vehicles",
      "subcompanies",
      "company_hire_terms_versions",
    ] as const) {
      if (summary[key] == null && hg[key] != null) summary[key] = hg[key];
    }
  }

  if (!companyName) {
    companyName = (summary.companies as { name?: string } | undefined)?.name?.trim() || null;
  }

  if (!termsPreview && includeTerms) {
    const fromJoin = hg.company_hire_terms_versions as
      | { title?: string; body?: string; version_label?: string }
      | null
      | undefined;
    if (fromJoin?.title && fromJoin?.body) {
      termsPreview = {
        title: fromJoin.title,
        body: fromJoin.body,
        versionLabel: fromJoin.version_label ?? null,
      };
    } else if (hg.hire_terms_version_id) {
      const { data: terms } = await admin
        .from("company_hire_terms_versions")
        .select("title, body, version_label")
        .eq("id", hg.hire_terms_version_id)
        .maybeSingle();
      if (terms) {
        termsPreview = {
          title: terms.title as string,
          body: terms.body as string,
          versionLabel: (terms.version_label as string) ?? null,
        };
      }
    }
  }

  return { hireSummary: summary, termsPreview, companyName };
}
