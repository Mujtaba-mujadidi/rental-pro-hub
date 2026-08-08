import { NextResponse } from "next/server";
import { revalidateCompanyGate } from "@/lib/auth/company-gate-cache";
import { revalidateProfileBundlesForCompany } from "@/lib/auth/profile-bundle-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Marks companies as access_blocked when the offboarding retention window has ended.
 * Call on a schedule (e.g. daily) with header: Authorization: Bearer <CRON_SECRET>.
 */
async function runOffboardingExpiry() {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server configuration error." },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("companies")
    .update({
      deletion_phase: "access_blocked",
      access_blocked_at: now,
    })
    .eq("deletion_phase", "offboarding")
    .lt("offboarding_ends_at", now)
    .select("id");

  if (error) {
    console.error("[cron/company-offboarding-expiry]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  for (const companyId of ids) {
    revalidateCompanyGate(companyId);
    await revalidateProfileBundlesForCompany(companyId);
  }

  return NextResponse.json({
    ok: true,
    updated: ids.length,
    ids,
  });
}

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runOffboardingExpiry();
}

export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runOffboardingExpiry();
}
