import { NextResponse } from "next/server";
import { gatherCompanyDeletionSnapshot } from "@/lib/companies/deletion-archive";
import { getRentalSessionLifecycle } from "@/lib/auth/rental-lifecycle";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const life = await getRentalSessionLifecycle(supabase, user.id, user.email);
  if (life.kind !== "rental" || life.deletionPhase !== "offboarding") {
    return NextResponse.json({ error: "Export is only available during the offboarding period." }, { status: 403 });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server configuration error." },
      { status: 500 },
    );
  }

  const built = await gatherCompanyDeletionSnapshot(admin, life.companyId, "offboarding_start");
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 500 });
  }

  const body = JSON.stringify(built.snapshot, null, 2);
  const safeId = life.companyId.replace(/[^a-zA-Z0-9-]/g, "_");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="company-data-export-${safeId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
