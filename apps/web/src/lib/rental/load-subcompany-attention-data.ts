import { cache } from "react";
import { ukTodayYmd, daysFromCalendarDateToExpiry } from "@/lib/datetime/uk";
import {
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { deriveHireInsuranceDocumentStatus, isHireInsuranceProvidedBy } from "@/lib/fleet/hire-insurance";
import { ACTIVE_HIRE_GROUP_STATUSES, type HirePaymentStatus } from "@/lib/fleet/hire-types";
import {
  missingRequiredDocTypes,
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  type VehicleDocType,
  type VehicleStatus,
} from "@/lib/fleet/vehicles";
import { vehicleExpiryAttentionItems } from "@/lib/fleet/vehicle-expiry-attention";
import { SUBCOMPANY_SELECT, mapSubcompanyRow } from "@/lib/rental/subcompany";
import {
  attentionPriority,
  accruedRentDueGbp,
  buildSubcompanyAttentionSummary,
  dueStatusForDaysRemaining,
  formatAttentionAmount,
  overdueRentDueLabel,
  resolvedCompletedLabel,
  type SubcompanyAttentionItem,
  type SubcompanyAttentionSummary,
} from "@/lib/rental/subcompany-attention-display";
import {
  hireIsEndedForSubcompanyDocumentImpact,
  reconcileEndedHireSubcompanyDocumentRequirements,
} from "@/lib/rental/subcompany-hire-document-requirements";
import type { SubcompanyDocumentKind } from "@/lib/rental/subcompany-workspace-types";
import { SUBCOMPANY_DOCUMENT_KIND_LABELS } from "@/lib/rental/subcompany-workspace-types";
import {
  parseCompanyNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SubcompanyAttentionData = {
  subcompanyName: string;
  summary: SubcompanyAttentionSummary;
  items: SubcompanyAttentionItem[];
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function hireStatusMeta(status: string): string {
  if (status === "active") return "Active driver";
  if (status === "reserved" || status === "pending_signature") return "Active hire";
  if (status === "completed" || status === "terminated") return "Previous hire";
  return "Hire";
}

function vehicleStatusMeta(status: string): string {
  if (status === "reserved") return "Reserved vehicle";
  if (status === "on_rent") return "On rent";
  if (status === "available") return "Available vehicle";
  return VEHICLE_STATUS_LABELS[status as VehicleStatus] ?? "Vehicle";
}

export async function loadSubcompanyAttentionData(
  companyId: string,
  subcompanyId: string,
): Promise<{ ok: true; data: SubcompanyAttentionData } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: subRow, error: subErr } = await supabase
    .from("subcompanies")
    .select(SUBCOMPANY_SELECT)
    .eq("id", subcompanyId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (subErr) return { ok: false, error: subErr.message };
  if (!subRow) return { ok: false, error: "Subcompany not found." };
  const subcompany = mapSubcompanyRow(subRow as Record<string, unknown>);

  try {
    const admin = createSupabaseAdminClient();
    await reconcileEndedHireSubcompanyDocumentRequirements(admin, {
      subcompanyId: subcompany.id,
      parentCompanyId: companyId,
    });
  } catch {
    // Non-fatal.
  }

  const todayYmd = ukTodayYmd();
  const { data: settingsRow } = await supabase
    .from("companies")
    .select(
      "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before, notify_insurance_days_before",
    )
    .eq("id", companyId)
    .maybeSingle();
  const notifySettings = parseCompanyNotificationSettings(
    settingsRow as Partial<CompanyNotificationSettings> | null,
  );

  const [vehiclesRes, hiresRes, reqsRes] = await Promise.all([
    supabase
      .from("vehicles")
      .select(
        "id, vrm, status, mot_expiry, tax_expiry, phv_licence_expiry",
      )
      .eq("subcompany_id", subcompany.id)
      .eq("parent_company_id", companyId)
      .neq("status", "sold"),
    supabase
      .from("vehicle_hire_groups")
      .select(
        "id, status, vehicle_id, driver_user_id, settlement_balance_gbp, settlement_balance_direction, insurance_provided_by, vehicle_hire_agreements(id, end_date, signed_at, status)",
      )
      .eq("subcompany_id", subcompany.id)
      .eq("parent_company_id", companyId)
      .not("status", "in", "(draft,cancelled)"),
    supabase
      .from("subcompany_hire_document_requirements")
      .select("id, hire_group_id, document_kind, agreement_id, inspection_id")
      .eq("subcompany_id", subcompany.id)
      .eq("status", "required"),
  ]);
  if (vehiclesRes.error) return { ok: false, error: vehiclesRes.error.message };
  if (hiresRes.error) return { ok: false, error: hiresRes.error.message };
  // Requirements table may be absent on older DBs — treat as empty.
  const vehicles = vehiclesRes.data;
  const hires = hiresRes.data;
  const reqs = reqsRes.error ? [] : reqsRes.data;

  const vehicleIds = (vehicles ?? []).map((v) => v.id as string);
  const hireIds = (hires ?? []).map((h) => h.id as string);
  const vehicleById = new Map(
    (vehicles ?? []).map((v) => [
      v.id as string,
      {
        id: v.id as string,
        vrm: String(v.vrm ?? "").trim() || "Vehicle",
        status: String(v.status ?? "available"),
        mot_expiry: (v.mot_expiry as string | null) ?? null,
        tax_expiry: (v.tax_expiry as string | null) ?? null,
        phv_licence_expiry: (v.phv_licence_expiry as string | null) ?? null,
      },
    ]),
  );

  const insuranceByHire = new Map<string, { expiryDate: string | null; hasDocument: boolean }>();
  if (hireIds.length) {
    const { data: insuranceRows } = await supabase
      .from("vehicle_hire_insurance")
      .select("hire_group_id, expiry_date, file_path")
      .in("hire_group_id", hireIds);
    for (const row of insuranceRows ?? []) {
      const hid = String(row.hire_group_id ?? "");
      if (!hid) continue;
      insuranceByHire.set(hid, {
        expiryDate: (row.expiry_date as string | null)?.slice(0, 10) ?? null,
        hasDocument: Boolean(String(row.file_path ?? "").trim()),
      });
    }
  }

  const docsByVehicle = new Map<string, string[]>();
  if (vehicleIds.length) {
    const versioned = await supabase
      .from("vehicle_documents")
      .select("vehicle_id, doc_type")
      .in("vehicle_id", vehicleIds)
      .eq("version_status", "current");
    const docs =
      versioned.error && String(versioned.error.message).toLowerCase().includes("version_status")
        ? (
            await supabase
              .from("vehicle_documents")
              .select("vehicle_id, doc_type")
              .in("vehicle_id", vehicleIds)
          ).data
        : versioned.error
          ? null
          : versioned.data;
    for (const d of docs ?? []) {
      const vid = String(d.vehicle_id ?? "");
      if (!vid) continue;
      const list = docsByVehicle.get(vid) ?? [];
      list.push(String(d.doc_type ?? ""));
      docsByVehicle.set(vid, list);
    }
  }

  const scheduleByHire = new Map<string, HirePaymentScheduleRowInput[]>();
  if (hireIds.length) {
    const { data: scheduleRows, error: scheduleErr } = await supabase
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, hire_group_id, period_start, period_end, row_kind, payment_status, approved_amount_gbp, base_amount_gbp, sort_order, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .in("hire_group_id", hireIds)
      .eq("row_kind", "rent");
    if (scheduleErr) return { ok: false, error: scheduleErr.message };
    for (const row of scheduleRows ?? []) {
      const hid = row.hire_group_id as string;
      const list = scheduleByHire.get(hid) ?? [];
      const discounts = row.vehicle_hire_schedule_discounts as { amount_gbp: number }[] | null;
      const discountTotalGbp = (discounts ?? []).reduce((sum, d) => sum + Number(d.amount_gbp ?? 0), 0);
      list.push({
        id: row.id as string,
        periodStart: String(row.period_start ?? "").slice(0, 10),
        periodEnd: String(row.period_end ?? "").slice(0, 10),
        rowKind: "rent",
        paymentStatus: row.payment_status as HirePaymentStatus,
        approvedAmountGbp:
          row.approved_amount_gbp == null ? null : Number(row.approved_amount_gbp),
        baseAmountGbp: Number(row.base_amount_gbp ?? 0),
        discountTotalGbp,
        pendingSubmittedGbp: null,
        sortOrder: Number(row.sort_order ?? 0),
      });
      scheduleByHire.set(hid, list);
    }
  }

  const items: SubcompanyAttentionItem[] = [];

  for (const vehicle of vehicleById.values()) {
    const present = docsByVehicle.get(vehicle.id) ?? [];
    for (const expiry of vehicleExpiryAttentionItems(vehicle, notifySettings)) {
      const days = expiry.daysUntil ?? 0;
      const due = dueStatusForDaysRemaining(days);
      const urgency = expiry.tone === "expired" || days <= 0 ? "urgent" : due.urgency;
      items.push({
        id: `veh-exp-${vehicle.id}-${expiry.kind}`,
        category: "documents",
        urgency,
        title: `${expiry.label} ${expiry.tone === "expired" ? "expired" : "expiring"}`,
        description:
          expiry.tone === "expired"
            ? `Vehicle must not be used until a current ${expiry.label} is recorded.`
            : `${expiry.label} needs renewal within the company notice window.`,
        meta: `${vehicle.vrm} · ${vehicleStatusMeta(vehicle.status)}`,
        dueStatusLabel: due.label,
        dueStatusTone: urgency === "urgent" ? "urgent" : "warn",
        amountGbp: null,
        amountLabel: "—",
        primaryActionLabel: "Open vehicle",
        primaryActionHref: `/rental/vehicles/${vehicle.id}/details`,
        priority: attentionPriority({ urgency, category: "documents" }),
      });
    }

    for (const missing of missingRequiredDocTypes(present)) {
      const label = VEHICLE_DOC_TYPE_LABELS[missing as VehicleDocType] ?? missing;
      items.push({
        id: `veh-miss-${vehicle.id}-${missing}`,
        category: "documents",
        urgency: "due_soon",
        title: `${label} missing`,
        description: `A current ${label} document is required on the vehicle record.`,
        meta: `${vehicle.vrm} · ${vehicleStatusMeta(vehicle.status)}`,
        dueStatusLabel: "Required now",
        dueStatusTone: "warn",
        amountGbp: null,
        amountLabel: "—",
        primaryActionLabel: "Replace document",
        primaryActionHref: `/rental/vehicles/${vehicle.id}/details`,
        priority: attentionPriority({ urgency: "due_soon", category: "documents" }),
      });
    }

    if (!present.map((t) => t.toLowerCase()).includes("insurance")) {
      items.push({
        id: `veh-miss-${vehicle.id}-insurance`,
        category: "documents",
        urgency: "due_soon",
        title: "Vehicle insurance missing",
        description: "No current vehicle insurance document is on file.",
        meta: `${vehicle.vrm} · ${vehicleStatusMeta(vehicle.status)}`,
        dueStatusLabel: "Required now",
        dueStatusTone: "warn",
        amountGbp: null,
        amountLabel: "—",
        primaryActionLabel: "Review insurance",
        primaryActionHref: `/rental/vehicles/${vehicle.id}/details`,
        priority: attentionPriority({ urgency: "due_soon", category: "documents" }),
      });
    }
  }

  for (const hire of hires ?? []) {
    const hireId = hire.id as string;
    const vehicle = vehicleById.get(hire.vehicle_id as string);
    const vrm = vehicle?.vrm ?? "Hire";
    const status = String(hire.status ?? "");
    const meta = `${vrm} · ${hireStatusMeta(status)}`;

    // Due rent on active hires: accrued periods (incl. current), net of discounts.
    if ((ACTIVE_HIRE_GROUP_STATUSES as readonly string[]).includes(status)) {
      const rows = scheduleByHire.get(hireId) ?? [];
      const due = accruedRentDueGbp(rows, todayYmd);
      if (due.totalGbp > 0.005) {
        const daysPastEnd =
          due.oldestUnpaidPeriodEnd != null
            ? Math.max(0, -(daysFromCalendarDateToExpiry(due.oldestUnpaidPeriodEnd, todayYmd) ?? 0))
            : 0;
        const hasEndedUnpaid = due.oldestUnpaidPeriodEnd != null && due.oldestUnpaidPeriodEnd < todayYmd;
        items.push({
          id: `hire-rent-${hireId}`,
          category: "rent",
          urgency: "urgent",
          title: hasEndedUnpaid ? "Rent payment overdue" : "Rent payment due",
          description:
            due.unpaidPeriodCount > 1
              ? `${due.unpaidPeriodCount} rent periods remain unpaid.`
              : "Outstanding rent is due on this hire.",
          meta,
          dueStatusLabel: hasEndedUnpaid ? overdueRentDueLabel(daysPastEnd) : "Due now",
          dueStatusTone: "urgent",
          amountGbp: due.totalGbp,
          amountLabel: formatAttentionAmount(due.totalGbp),
          primaryActionLabel: "Record payment",
          primaryActionHref: `/rental/balances/${hireId}`,
          priority: attentionPriority({ urgency: "urgent", category: "rent" }),
        });
      }
    } else if (status === "completed" || status === "terminated") {
      // Ended hire settlement owed by driver
      const direction = hire.settlement_balance_direction as string | null;
      const settlement = Number(hire.settlement_balance_gbp ?? 0);
      if (direction === "driver_owes_company" && settlement > 0.005) {
        items.push({
          id: `hire-settle-${hireId}`,
          category: "rent",
          urgency: "urgent",
          title: "Final balance outstanding",
          description: "Settlement balance is still owed after contract end.",
          meta,
          dueStatusLabel: "Due now",
          dueStatusTone: "urgent",
          amountGbp: roundGbp(settlement),
          amountLabel: formatAttentionAmount(settlement),
          primaryActionLabel: "Record payment",
          primaryActionHref: `/rental/balances/${hireId}`,
          priority: attentionPriority({ urgency: "urgent", category: "rent" }),
        });
      }
    }

    // Contract ending soon
    if (status === "active") {
      const agreements = (hire.vehicle_hire_agreements ?? []) as Array<{
        end_date?: string | null;
        signed_at?: string | null;
        status?: string | null;
      }>;
      const endDates = agreements
        .map((a) => a.end_date?.slice(0, 10))
        .filter((d): d is string => Boolean(d))
        .sort();
      const endDate = endDates[0] ?? null;
      if (endDate) {
        const days = daysFromCalendarDateToExpiry(endDate, todayYmd);
        if (
          days != null &&
          days >= 0 &&
          days <= notifySettings.notify_contract_expiry_days_before
        ) {
          const due = dueStatusForDaysRemaining(days);
          items.push({
            id: `hire-end-${hireId}`,
            category: "contracts",
            urgency: due.urgency,
            title: days <= 7 ? "Hire contract ending soon" : "Contract review approaching",
            description:
              days <= 7
                ? "Review extension or return arrangements with the driver."
                : "Confirm whether the rolling hire should continue.",
            meta,
            dueStatusLabel: due.label,
            dueStatusTone: due.tone,
            amountGbp: null,
            amountLabel: "—",
            primaryActionLabel: "Review contract",
            primaryActionHref: `/rental/hires/${hireId}`,
            priority: attentionPriority({ urgency: due.urgency, category: "contracts" }),
          });
        }
      }
    }

    // Hire insurance
    if (["pending_signature", "reserved", "active"].includes(status)) {
      const providedByRaw = (hire.insurance_provided_by as string | null) ?? null;
      const providedBy =
        providedByRaw && isHireInsuranceProvidedBy(providedByRaw) ? providedByRaw : null;
      const insuranceRow = insuranceByHire.get(hireId);
      const insuranceStatus = deriveHireInsuranceDocumentStatus({
        providedBy,
        hasDocument: Boolean(insuranceRow?.hasDocument),
        expiryDate: insuranceRow?.expiryDate ?? null,
        notifyDaysBefore: notifySettings.notify_insurance_days_before,
        todayYmd,
      });
      if (
        insuranceStatus === "awaiting_upload" ||
        insuranceStatus === "expired" ||
        insuranceStatus === "expiring"
      ) {
        const urgency =
          insuranceStatus === "expired" || insuranceStatus === "awaiting_upload"
            ? "urgent"
            : "due_soon";
        items.push({
          id: `hire-ins-${hireId}`,
          category: "documents",
          urgency,
          title:
            insuranceStatus === "expired"
              ? "Hire insurance expired"
              : insuranceStatus === "expiring"
                ? "Hire insurance expiring"
                : "Driver insurance missing",
          description:
            insuranceStatus === "awaiting_upload"
              ? "A current insurance document is required for the hire record."
              : "Review the hire insurance certificate.",
          meta,
          dueStatusLabel:
            insuranceStatus === "awaiting_upload"
              ? "Required now"
              : insuranceStatus === "expired"
                ? "Expired"
                : "Due soon",
          dueStatusTone: urgency === "urgent" ? "urgent" : "warn",
          amountGbp: null,
          amountLabel: "—",
          primaryActionLabel:
            insuranceStatus === "awaiting_upload" ? "Request document" : "Review insurance",
          primaryActionHref: `/rental/hires/${hireId}/details`,
          priority: attentionPriority({ urgency, category: "documents" }),
        });
      }
    }

    // Unsigned agreements
    if (status === "pending_signature" || status === "reserved") {
      const agreements = (hire.vehicle_hire_agreements ?? []) as Array<{
        signed_at?: string | null;
        status?: string | null;
      }>;
      const unsigned = agreements.filter((a) => !a.signed_at).length;
      if (unsigned > 0) {
        items.push({
          id: `hire-sign-${hireId}`,
          category: "contracts",
          urgency: "due_soon",
          title: "Agreement awaiting signature",
          description:
            unsigned === 1
              ? "One hire agreement is still unsigned."
              : `${unsigned} hire agreements are still unsigned.`,
          meta,
          dueStatusLabel: "Action needed",
          dueStatusTone: "warn",
          amountGbp: null,
          amountLabel: "—",
          primaryActionLabel: "Open hire",
          primaryActionHref: `/rental/hires/${hireId}`,
          priority: attentionPriority({ urgency: "due_soon", category: "contracts" }),
        });
      }
    }

    // Resolved: recently signed
    const agreements = (hire.vehicle_hire_agreements ?? []) as Array<{
      signed_at?: string | null;
    }>;
    for (const a of agreements) {
      const signedAt = a.signed_at?.trim();
      if (!signedAt) continue;
      const signedDay = signedAt.slice(0, 10);
      const age = daysFromCalendarDateToExpiry(signedDay, todayYmd);
      if (age == null || age < -30) continue;
      items.push({
        id: `hire-resolved-${hireId}-${signedDay}`,
        category: "contracts",
        urgency: "resolved",
        title: "Agreement signature completed",
        description: "All parties signed and the agreement was archived.",
        meta: `${vrm} · Previous hire`,
        dueStatusLabel: resolvedCompletedLabel(signedAt),
        dueStatusTone: "ok",
        amountGbp: null,
        amountLabel: "—",
        primaryActionLabel: "View agreement",
        primaryActionHref: `/rental/hires/${hireId}/details`,
        priority: attentionPriority({ urgency: "resolved", category: "contracts" }),
      });
      break;
    }
  }

  // Open subcompany document impact requirements
  const statusByHire = new Map(
    (hires ?? []).map((h) => [h.id as string, String(h.status ?? "")]),
  );
  for (const r of reqs ?? []) {
    const hireGroupId = r.hire_group_id as string;
    if (hireIsEndedForSubcompanyDocumentImpact(statusByHire.get(hireGroupId) ?? "")) continue;
    const hire = (hires ?? []).find((h) => h.id === hireGroupId);
    const vehicle = hire ? vehicleById.get(hire.vehicle_id as string) : null;
    const vrm = vehicle?.vrm ?? "Hire";
    const documentKind = r.document_kind as SubcompanyDocumentKind;
    const kindLabel = SUBCOMPANY_DOCUMENT_KIND_LABELS[documentKind] ?? "Document";
    const href =
      documentKind === "inspection_checkout"
        ? `/rental/hires/${hireGroupId}/checkout`
        : documentKind === "inspection_checkin"
          ? `/rental/hires/${hireGroupId}/checkin`
          : `/rental/hires/${hireGroupId}/details`;
    items.push({
      id: `req-${r.id as string}`,
      category: "documents",
      urgency: "due_soon",
      title: `${kindLabel} update required`,
      description: "Subcompany details changed and this hire document still needs updating.",
      meta: `${vrm} · ${hireStatusMeta(statusByHire.get(hireGroupId) ?? "")}`,
      dueStatusLabel: "Required now",
      dueStatusTone: "warn",
      amountGbp: null,
      amountLabel: "—",
      primaryActionLabel: "Open hire",
      primaryActionHref: href,
      priority: attentionPriority({ urgency: "due_soon", category: "documents" }),
    });
  }

  items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  const summary = buildSubcompanyAttentionSummary(items);

  return {
    ok: true,
    data: {
      subcompanyName: subcompany.name,
      summary,
      items,
    },
  };
}

/** Lightweight open-count for the Attention tab badge. */
export async function loadSubcompanyAttentionOpenCount(
  companyId: string,
  subcompanyId: string,
): Promise<number> {
  const res = await getSubcompanyAttentionData(companyId, subcompanyId);
  if (!res.ok) return 0;
  return res.data.summary.openCount;
}

export const getSubcompanyAttentionData = cache(loadSubcompanyAttentionData);
