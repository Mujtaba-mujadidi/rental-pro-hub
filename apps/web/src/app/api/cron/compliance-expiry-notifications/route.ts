import { NextResponse } from "next/server";
import { runComplianceExpiryNotifications } from "@/lib/platform-compliance-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Sends compliance expiry notifications (vehicle MOT/tax/PHV, driver licences,
 * hire insurance, hire contract end dates) using each company's lead-time settings.
 * Call on a schedule (e.g. daily) with header: Authorization: Bearer <CRON_SECRET>.
 */
async function runComplianceExpiryCron() {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server configuration error." },
      { status: 500 },
    );
  }

  const result = await runComplianceExpiryNotifications(admin);

  return NextResponse.json({
    ok: true,
    ...result,
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
  return runComplianceExpiryCron();
}

export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runComplianceExpiryCron();
}
