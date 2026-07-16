import { NextResponse } from "next/server";

/** DocuSeal webhook removed — native e-sign only. */
export async function POST() {
  return NextResponse.json(
    { error: "DocuSeal webhooks are no longer supported. Use native RMS e-sign." },
    { status: 410 },
  );
}
