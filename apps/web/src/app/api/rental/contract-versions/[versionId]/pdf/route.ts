import { NextResponse } from "next/server";
import { loadAppProfileFromRequest } from "@/lib/auth/profile";
import { loadRentalContractVersionPdfAccess } from "@/lib/companies/rental-contract-version-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ESIGN_BUCKET } from "@/lib/esign/types";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ versionId: string }> },
) {
  try {
    const profile = await loadAppProfileFromRequest();
    if (!profile || profile.role !== "rental_company") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { versionId } = await ctx.params;
    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Config error" }, { status: 500 });
    }

    const access = await loadRentalContractVersionPdfAccess(admin, profile, versionId);
    if (!access) {
      return NextResponse.json({ error: "Agreement PDF not found." }, { status: 404 });
    }

    const { data, error } = await admin.storage.from(ESIGN_BUCKET).download(access.pdfPath);
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Download failed" }, { status: 404 });
    }

    const url = new URL(req.url);
    const disposition = url.searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
    const buf = await data.arrayBuffer();

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${access.fileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[rental/contract-versions/pdf] unexpected error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load PDF." },
      { status: 500 },
    );
  }
}
