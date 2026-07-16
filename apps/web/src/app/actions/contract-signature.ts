"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { preparePlatformCompanyContractEnvelope } from "@/lib/esign/adapters/platform-company-contract";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PrepareContractEsignResult =
  | { ok: true; envelopeId: string }
  | { ok: false; error: string };

/** Prepare PDF + envelope, then open designer at /super-admin/esign/[envelopeId]. */
export async function prepareCompanyContractForEsignAction(
  parentCompanyId: string,
): Promise<PrepareContractEsignResult> {
  const { user } = await requireSuperAdmin();
  const companyId = parentCompanyId?.trim();
  if (!companyId) return { ok: false, error: "Missing company." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const res = await preparePlatformCompanyContractEnvelope(admin, companyId, user.id);
  if (res.ok) {
    revalidatePath("/super-admin/companies");
    revalidatePath("/rental");
  }
  return res;
}
