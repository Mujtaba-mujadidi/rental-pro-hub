import { trySendPendingPrimaryInviteAfterContractSigned } from "@/app/actions/admin-companies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyCompanyFinanceRoles } from "@/lib/platform-notifications";

type WebhookBody = {
  event_type?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

function submissionIdFromBody(body: WebhookBody): string | null {
  const et = body.event_type ?? "";
  if (et === "submission.completed") {
    const id = body.data?.id;
    if (typeof id === "number") return String(id);
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  if (et.startsWith("form.")) {
    const sub = body.data?.submission as Record<string, unknown> | undefined;
    const id = sub?.id;
    if (typeof id === "number") return String(id);
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function appendAudit(
  existing: unknown,
  entry: Record<string, unknown>,
): Record<string, unknown>[] {
  const arr = Array.isArray(existing) ? [...(existing as Record<string, unknown>[])] : [];
  arr.push({ ...entry, at: new Date().toISOString() });
  return arr;
}

export async function processDocusealWebhook(body: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = body as WebhookBody;
  const eventType = b.event_type ?? "";
  const sid = submissionIdFromBody(b);
  if (!sid) {
    return { ok: true };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Admin client unavailable." };
  }

  const { data: reqRow, error: findErr } = await admin
    .from("contract_signature_requests")
    .select("id, contract_id, version_id, status, audit_trail, metadata")
    .eq("provider_submission_id", sid)
    .maybeSingle();

  if (findErr) return { ok: false, error: findErr.message };
  if (!reqRow?.id) {
    return { ok: true };
  }

  const audit_trail = appendAudit(reqRow.audit_trail, { event_type: eventType, payload: b.data ?? {} });

  if (eventType === "form.viewed" || eventType === "form.started") {
    await admin
      .from("contract_signature_requests")
      .update({ status: "viewed", audit_trail })
      .eq("id", reqRow.id);
    return { ok: true };
  }

  if (eventType === "form.declined") {
    await admin
      .from("contract_signature_requests")
      .update({ status: "declined", audit_trail })
      .eq("id", reqRow.id);
    if (reqRow.contract_id) {
      await admin.from("company_contracts").update({ status: "draft" }).eq("id", reqRow.contract_id);
    }
    return { ok: true };
  }

  const completed =
    eventType === "submission.completed" ||
    (eventType === "form.completed" &&
      ((b.data?.submission as Record<string, unknown> | undefined)?.status === "completed"));

  if (!completed) {
    await admin.from("contract_signature_requests").update({ audit_trail }).eq("id", reqRow.id);
    return { ok: true };
  }

  if (reqRow.status === "active" || reqRow.status === "signed_by_customer") {
    await admin.from("contract_signature_requests").update({ audit_trail }).eq("id", reqRow.id);
    return { ok: true };
  }

  const now = new Date().toISOString();
  const sub = b.data?.submission as Record<string, unknown> | undefined;
  const docUrl =
    (typeof sub?.combined_document_url === "string" && sub.combined_document_url) ||
    (typeof sub?.audit_log_url === "string" && sub.audit_log_url) ||
    null;

  await admin
    .from("contract_signature_requests")
    .update({
      status: "active",
      audit_trail,
      metadata: {
        ...(typeof reqRow.metadata === "object" && reqRow.metadata ? reqRow.metadata : {}),
        last_webhook_event: eventType,
        combined_document_url: docUrl,
      },
    })
    .eq("id", reqRow.id);

  if (reqRow.version_id) {
    await admin
      .from("company_contract_versions")
      .update({
        version_status: "active",
        signed_at: now,
        signed_by_customer_at: now,
        countersigned_at: now,
        rendered_pdf_storage_path: docUrl,
      })
      .eq("id", reqRow.version_id);
  }

  if (reqRow.contract_id) {
    await admin
      .from("company_contracts")
      .update({
        status: "active",
        contract_signed_at: now,
      })
      .eq("id", reqRow.contract_id);

    const { data: cc } = await admin
      .from("company_contracts")
      .select("parent_company_id")
      .eq("id", reqRow.contract_id)
      .maybeSingle();
    if (cc?.parent_company_id) {
      const parentId = cc.parent_company_id as string;
      await notifyCompanyFinanceRoles(admin, parentId, "contract_signed", {
        contract_id: reqRow.contract_id,
        version_id: reqRow.version_id,
      });
      await trySendPendingPrimaryInviteAfterContractSigned(admin, parentId);
    }
  }

  return { ok: true };
}
