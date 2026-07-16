import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminCompanyDetailPayload } from "@/lib/admin/company-list-shared";

export type FetchAdminCompanyDetailResult =
  | { ok: true; payload: AdminCompanyDetailPayload }
  | { ok: false; error: string };

export async function fetchAdminCompanyDetail(companyId: string): Promise<FetchAdminCompanyDetailResult> {
  const id = companyId.trim();
  if (!id) {
    return { ok: false, error: "Missing company id." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: company, error: companyErr } = await admin.from("companies").select("*").eq("id", id).maybeSingle();

  if (companyErr) {
    return { ok: false, error: companyErr.message };
  }
  if (!company) {
    return { ok: false, error: "Company not found." };
  }

  const [{ data: subcompanies, error: subErr }, { data: companyContract, error: ccErr }] = await Promise.all([
    admin.from("subcompanies").select("*").eq("parent_company_id", id).order("is_primary", { ascending: false }),
    admin.from("company_contracts").select("*").eq("parent_company_id", id).maybeSingle(),
  ]);

  if (subErr) {
    return { ok: false, error: subErr.message };
  }
  if (ccErr) {
    return { ok: false, error: ccErr.message };
  }

  const payload: AdminCompanyDetailPayload = {
    company: company as Record<string, unknown>,
    subcompanies: (subcompanies ?? []) as Record<string, unknown>[],
    companyContract: companyContract ? (companyContract as Record<string, unknown>) : null,
  };

  return { ok: true, payload };
}
