import { processDocusealWebhook } from "@/lib/docuseal/webhook-handler";
import { getDocusealWebhookHeaderName, getDocusealWebhookSecret } from "@/lib/docuseal/config";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = getDocusealWebhookSecret();
  if (secret) {
    const headerName = getDocusealWebhookHeaderName();
    const got = req.headers.get(headerName) ?? req.headers.get(headerName.toLowerCase());
    if (got !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await processDocusealWebhook(body);
  if (!result.ok) {
    console.error("docuseal webhook", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
