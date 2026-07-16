import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { collectTenantAuthUserIds } from "@/lib/companies/deletion-archive";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type PurgeProgressFn = (message: string) => void;

/**
 * Hard-delete a company: rental tenant Auth users, then company row (CASCADE), then logo object.
 * Calls `onProgress` at each stage for streamed UX.
 * Verifies the company row was actually removed (avoids silent no-op).
 */
export async function runPermanentCompanyPurgeWithProgress(
  admin: Admin,
  companyId: string,
  logoStoragePath: string | null,
  onProgress: PurgeProgressFn,
): Promise<{ ok: true } | { ok: false; error: string }> {
  onProgress("Collecting tenant accounts…");
  const tenantUserIds = await collectTenantAuthUserIds(admin, companyId);

  const toRemove: string[] = [];
  for (const uid of tenantUserIds) {
    const { data: prof, error: profErr } = await admin.from("profiles").select("id, role").eq("id", uid).maybeSingle();
    if (profErr || !prof?.id) continue;
    const r = prof.role as string;
    if (r === "super_admin" || r === "driver") continue;
    if (r !== "rental_company") continue;
    toRemove.push(uid);
  }

  const n = toRemove.length;
  if (n === 0) {
    onProgress("No rental_company Auth accounts linked to this tenant.");
  } else {
    onProgress(`Deleting ${n} rental tenant Auth account(s)…`);
  }

  for (let i = 0; i < toRemove.length; i++) {
    const uid = toRemove[i]!;
    onProgress(`Deleting tenant account ${i + 1} of ${n}…`);
    const { error: authDelErr } = await admin.auth.admin.deleteUser(uid);
    if (authDelErr) {
      return { ok: false, error: `Could not delete tenant user: ${authDelErr.message}` };
    }
  }

  onProgress("Removing e-sign documents from storage…");
  try {
    const { data: envs } = await admin
      .from("esign_envelopes")
      .select("id, unsigned_pdf_path, signed_pdf_path")
      .eq("parent_company_id", companyId);
    const paths: string[] = [];
    for (const e of envs ?? []) {
      if (e.unsigned_pdf_path) paths.push(e.unsigned_pdf_path as string);
      if (e.signed_pdf_path) paths.push(e.signed_pdf_path as string);
    }
    if (paths.length) {
      const { error: rmEs } = await admin.storage.from("esign-documents").remove(paths);
      if (rmEs) {
        console.error("[permanent-company-purge] esign storage", rmEs);
        onProgress("E-sign file removal had a warning.");
      }
    }
    await admin.from("esign_envelopes").delete().eq("parent_company_id", companyId);
  } catch (e) {
    console.error("[permanent-company-purge] esign cleanup", e);
  }

  onProgress("Deleting company record (related rows cascade)…");
  const { data: deletedRows, error: delErr } = await admin.from("companies").delete().eq("id", companyId).select("id");
  if (delErr) {
    return { ok: false, error: delErr.message };
  }
  if (!deletedRows?.length) {
    return {
      ok: false,
      error:
        "The company row was not removed (zero rows deleted). Check Supabase logs, foreign keys, and that the service role can delete from public.companies.",
    };
  }

  if (logoStoragePath) {
    onProgress("Removing company logo from storage…");
    const { error: rmLogoErr } = await admin.storage.from("company-logos").remove([logoStoragePath]);
    if (rmLogoErr) {
      console.error("[permanent-company-purge] logo remove", rmLogoErr);
      onProgress("Logo removal had a warning (company is still deleted).");
    }
  }

  onProgress("Finished.");
  return { ok: true };
}
