import { cache } from "react";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canWriteSubcompany } from "@/lib/auth/rental-permissions";
import {
  mapSubcompanyRow,
  SUBCOMPANY_SELECT,
  type SubcompanyWorkspaceShell,
} from "@/lib/rental/subcompany";
import { resolveSubcompanyWorkspaceLogoDisplayUrl } from "@/lib/rental/subcompany-logo";
import { reconcileEndedHireSubcompanyDocumentRequirements } from "@/lib/rental/subcompany-hire-document-requirements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Select without logo until migration `20260730140000_subcompany_workspace` is applied. */
const SUBCOMPANY_SELECT_LEGACY =
  "id, parent_company_id, is_primary, name, display_name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode, country, primary_contact_first_name, primary_contact_last_name, primary_contact_dob, primary_contact_phone, primary_contact_email, status, notes, created_at, updated_at";

export type SubcompanyWorkspaceShellResult =
  | { ok: true; shell: SubcompanyWorkspaceShell }
  | { ok: false; error: string };

function isMissingSchemaError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("logo_storage_path") ||
    m.includes("subcompany_hire_document_requirements") ||
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache")
  );
}

async function fetchSubcompanyWorkspaceShell(
  subcompanyId: string,
): Promise<SubcompanyWorkspaceShellResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = subcompanyId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false, error: "Subcompany not found." };
  }

  const supabase = await createClient();
  let { data, error } = await supabase
    .from("subcompanies")
    .select(SUBCOMPANY_SELECT)
    .eq("id", id)
    .eq("parent_company_id", parentCompanyId)
    .maybeSingle();

  if (error && isMissingSchemaError(error.message)) {
    const fallback = await supabase
      .from("subcompanies")
      .select(SUBCOMPANY_SELECT_LEGACY)
      .eq("id", id)
      .eq("parent_company_id", parentCompanyId)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Subcompany not found." };

  const subcompany = mapSubcompanyRow({
    ...(data as Record<string, unknown>),
    logo_storage_path: (data as { logo_storage_path?: string | null }).logo_storage_path ?? null,
  });

  try {
    const admin = createSupabaseAdminClient();
    await reconcileEndedHireSubcompanyDocumentRequirements(admin, {
      subcompanyId: id,
      parentCompanyId,
    });
  } catch {
    // Non-fatal — shell still loads.
  }

  let openRequirementCount = 0;
  const { count, error: reqErr } = await supabase
    .from("subcompany_hire_document_requirements")
    .select("id", { count: "exact", head: true })
    .eq("subcompany_id", id)
    .eq("status", "required");
  if (!reqErr) {
    openRequirementCount = count ?? 0;
  }

  let logoSignedUrl: string | null = null;
  let companyLogoPath: string | null = null;
  if (subcompany.is_primary) {
    const { data: company } = await supabase
      .from("companies")
      .select("logo_storage_path")
      .eq("id", parentCompanyId)
      .maybeSingle();
    companyLogoPath = (company?.logo_storage_path as string | null) ?? null;
  }

  const logoOnFile = Boolean(subcompany.logo_storage_path?.trim() || companyLogoPath?.trim());
  if (logoOnFile) {
    let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      admin = null;
    }
    logoSignedUrl = await resolveSubcompanyWorkspaceLogoDisplayUrl(
      supabase,
      {
        subcompanyLogoPath: subcompany.logo_storage_path,
        companyLogoPath,
        parentCompanyId,
        subcompanyId: id,
      },
      admin,
    );
  }

  const canWrite = canWriteSubcompany(profile);

  return {
    ok: true,
    shell: {
      subcompany,
      canWrite,
      canDeactivate: canWrite && !subcompany.is_primary,
      openRequirementCount,
      logoSignedUrl,
      logoOnFile,
    },
  };
}

/** Deduped per server request (layout + any server child loading the same subcompany). */
export const getSubcompanyWorkspaceShell = cache(fetchSubcompanyWorkspaceShell);
