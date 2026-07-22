import { NextResponse } from "next/server";
import { loadAppProfileFromRequest } from "@/lib/auth/profile";
import { isSuperAdmin as checkIsSuperAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findRecipientByAccessToken, parseFieldValues, downloadUnsignedPdf } from "@/lib/esign/envelope";
import { assertBundleAccessToEnvelope } from "@/lib/esign/hire-signing-bundle";
import { expandDerivedFieldValues } from "@/lib/esign/field-values";
import { stampPdfWithFieldValues } from "@/lib/esign/pdf-stamp";
import {
  driverCanAccessHireEnvelope,
  rentalStaffCanAccessHireEnvelope,
  rentalStaffCanReadHireEnvelope,
} from "@/lib/esign/rental-hire-envelope-access";
import { ESIGN_BUCKET, type EsignFieldLayoutItem } from "@/lib/esign/types";

/**
 * Stream PDF for designer / super-admin viewer, rental hire staff, drivers, or verified signer (?token=).
 * - default / unsigned: raw unsigned PDF
 * - variant=current: stamped with field_values collected so far
 * - variant=signed: final completed PDF (authorised viewers only)
 */
export async function GET(req: Request, ctx: { params: Promise<{ envelopeId: string }> }) {
  try {
    const { envelopeId } = await ctx.params;
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();
    const bundleToken = url.searchParams.get("bundleToken")?.trim();
    const variant = url.searchParams.get("variant");

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Config error" }, { status: 500 });
    }

    let viewerIsSuperAdmin = false;
    let canAccessAsRentalStaff = false;
    let canAccessAsRentalReader = false;
    let canAccessAsDriver = false;
    let canAccessViaBundle = false;

    if (bundleToken) {
      const access = await assertBundleAccessToEnvelope(admin, bundleToken, envelopeId);
      if (!access.ok) return NextResponse.json({ error: access.error }, { status: 401 });
      canAccessViaBundle = true;
    } else if (token) {
      const found = await findRecipientByAccessToken(admin, token);
      if (!found.ok) return NextResponse.json({ error: found.error }, { status: 401 });
      if (!found.recipient.verified_at) {
        return NextResponse.json({ error: "OTP required" }, { status: 401 });
      }
      if (found.recipient.envelope_id !== envelopeId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (variant === "signed") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      const profile = await loadAppProfileFromRequest();
      if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      viewerIsSuperAdmin = checkIsSuperAdmin(user.email, profile);
      if (!viewerIsSuperAdmin) {
        canAccessAsRentalStaff = await rentalStaffCanAccessHireEnvelope(admin, profile, envelopeId);
        canAccessAsRentalReader = await rentalStaffCanReadHireEnvelope(admin, profile, envelopeId);
        canAccessAsDriver = await driverCanAccessHireEnvelope(admin, user.id, envelopeId);
      }
      if (!viewerIsSuperAdmin && !canAccessAsRentalStaff && !canAccessAsRentalReader && !canAccessAsDriver) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { data: env } = await admin
      .from("esign_envelopes")
      .select("unsigned_pdf_path, signed_pdf_path, field_layout, field_values, status")
      .eq("id", envelopeId)
      .maybeSingle();

    if (!env) return NextResponse.json({ error: "Envelope not found" }, { status: 404 });

    const signedPath = env.signed_pdf_path as string | undefined;
    const unsignedPath = env.unsigned_pdf_path as string | undefined;
    const isCompleted = env.status === "completed";

    if (variant === "signed") {
      const canViewSigned =
        isCompleted &&
        signedPath &&
        (viewerIsSuperAdmin ||
          canAccessAsRentalStaff ||
          canAccessAsRentalReader ||
          canAccessAsDriver ||
          canAccessViaBundle);

      if (!canViewSigned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data, error } = await admin.storage.from(ESIGN_BUCKET).download(signedPath);
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? "Download failed" }, { status: 404 });
      }
      const buf = await data.arrayBuffer();
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="signed-contract.pdf"',
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (canAccessViaBundle || token) {
      // bundle / legacy recipient token callers handled above for signed variant
    } else if (!viewerIsSuperAdmin && !canAccessAsRentalStaff && !canAccessAsRentalReader && !canAccessAsDriver) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (variant === "current") {
      const layout = (env.field_layout ?? []) as EsignFieldLayoutItem[];
      const values = parseFieldValues(env.field_values);
      const unsigned = await downloadUnsignedPdf(admin, envelopeId);
      if (!unsigned) return NextResponse.json({ error: "PDF not found" }, { status: 404 });
      try {
        const expanded = expandDerivedFieldValues(layout, values);
        const stamped = await stampPdfWithFieldValues(unsigned, layout, expanded);
        return new NextResponse(Buffer.from(stamped), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="contract-current.pdf"',
            "Cache-Control": "private, no-store",
          },
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Could not render PDF." },
          { status: 500 },
        );
      }
    }

    if (!unsignedPath) return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    const { data, error } = await admin.storage.from(ESIGN_BUCKET).download(unsignedPath);
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Download failed" }, { status: 404 });
    }
    const buf = await data.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="contract.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[esign/pdf] unexpected error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load PDF." },
      { status: 500 },
    );
  }
}
