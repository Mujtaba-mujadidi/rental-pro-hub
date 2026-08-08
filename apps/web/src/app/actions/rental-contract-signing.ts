"use server";

import { headers } from "next/headers";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { getPendingContractRenewalCached } from "@/lib/companies/pending-contract-renewal";
import { resendEnvelopeForSignature } from "@/lib/esign/envelope";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RentalContractSigningResult = { ok: true } | { ok: false; error: string };

async function loadPendingRenewalForSession() {
  const { user, profile } = await requireRentalCompanyArea({ skipActiveContractRequirement: true });
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false as const, error: "No company linked to this account." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const pending = await getPendingContractRenewalCached(companyId);
  if (!pending) return { ok: false as const, error: "No renewal contract is waiting for signature." };

  return { ok: true as const, user, companyId, pending, admin };
}

/** Resend the renewal contract signing email to the signatory. */
export async function resendRentalContractRenewalSigningEmailAction(): Promise<RentalContractSigningResult> {
  const ctx = await loadPendingRenewalForSession();
  if (!ctx.ok) return ctx;
  if (!ctx.pending.envelopeId) return { ok: false, error: ctx.pending.signBlockedReason ?? "Contract not ready." };
  if (!ctx.pending.signReady) return { ok: false, error: ctx.pending.signBlockedReason ?? "Contract not ready." };

  const h = await headers();
  const res = await resendEnvelopeForSignature(ctx.admin, ctx.pending.envelopeId, {
    ip: h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
    actor: ctx.user.id,
  });
  return res;
}
