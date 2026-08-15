import { cache } from "react";
import { ukTodayYmd, daysFromCalendarDateToExpiry } from "@/lib/datetime/uk";
import {
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { deriveHireInsuranceDocumentStatus, isHireInsuranceProvidedBy } from "@/lib/fleet/hire-insurance";
import { type HirePaymentStatus } from "@/lib/fleet/hire-types";
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
  countUnsignedLiveAgreements,
  dedupeAttentionItemsById,
  buildSubcompanyAttentionSummary,
  dueStatusForDaysRemaining,
  formatAttentionAmount,
  overdueRentDueGbp,
  overdueRentDueLabel,
  pickContractAttentionEndDate,
  type SubcompanyAttentionItem,
  type SubcompanyAttentionSummary,
} from "@/lib/rental/subcompany-attention-display";
import { hireIsEndedForSubcompanyDocumentImpact } from "@/lib/rental/subcompany-hire-document-requirements";
import type { SubcompanyDocumentKind } from "@/lib/rental/subcompany-workspace-types";
import { SUBCOMPANY_DOCUMENT_KIND_LABELS } from "@/lib/rental/subcompany-workspace-types";
import {
  parseCompanyNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import { reconcileSubcompanyRequirementsOnce } from "@/lib/rental/reconcile-subcompany-requirements-cached";
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

  await reconcileSubcompanyRequirementsOnce(subcompany.id, companyId);

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
    let docs = versioned.data;
    if (versioned.error) {
      const msg = String(versioned.error.message).toLowerCase();
      if (msg.includes("version_status")) {
        // Pre-migration DBs: take latest row per vehicle+type by created_at when available.
        const legacy = await supabase
          .from("vehicle_documents")
          .select("vehicle_id, doc_type, created_at")
          .in("vehicle_id", vehicleIds)
          .order("created_at", { ascending: false });
        const seen = new Set<string>();
        docs = [];
        for (const d of legacy.data ?? []) {
          const key = `${d.vehicle_id}:${String(d.doc_type ?? "").toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          docs.push(d);
        }
      } else {
        docs = [];
      }
    }
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
  const hireIdSet = new Set(hireIds);

  for (const vehicle of vehicleById.values()) {
    const present = docsByVehicle.get(vehicle.id) ?? [];
    const expiryItems = vehicleExpiryAttentionItems(vehicle, notifySettings);
    const expiryKindsWithAlert = new Set(
      expiryItems.filter((e) => e.tone === "expired" || e.tone === "expiring").map((e) => e.kind),
    );

    for (const expiry of expiryItems) {
      if (expiry.tone !== "expired" && expiry.tone !== "expiring") continue;
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
        dueSortDays: days,
        newestSortKey: expiry.isoDate?.slice(0, 10) ?? todayYmd,
      });
    }

    for (const missing of missingRequiredDocTypes(present)) {
      // One alert per compliance gap: skip missing-file when an expiry alert already covers it.
      if (missing === "mot" && expiryKindsWithAlert.has("mot")) continue;
      if (missing === "phv_taxi_licence_paper" && expiryKindsWithAlert.has("phv")) continue;
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
        dueSortDays: 0,
        newestSortKey: todayYmd,
      });
    }
    // Vehicle insurance is optional in the required pack — do not alert here.
    // Hire-level insurance is handled separately when insurance_provided_by is set.
  }

  for (const hire of hires ?? []) {
    const hireId = hire.id as string;
    const vehicle = vehicleById.get(hire.vehicle_id as string);
    const vrm = vehicle?.vrm ?? "Hire";
    const status = String(hire.status ?? "");
    const meta = `${vrm} · ${hireStatusMeta(status)}`;
    const agreements = (hire.vehicle_hire_agreements ?? []) as Array<{
      end_date?: string | null;
      signed_at?: string | null;
      status?: string | null;
    }>;

    // Overdue rent on active hires only (period ended + unpaid), net of discounts.
    if (status === "active") {
      const rows = scheduleByHire.get(hireId) ?? [];
      const due = overdueRentDueGbp(rows, todayYmd);
      if (due.totalGbp > 0.005) {
        const daysPastEnd =
          due.oldestUnpaidPeriodEnd != null
            ? Math.max(0, -(daysFromCalendarDateToExpiry(due.oldestUnpaidPeriodEnd, todayYmd) ?? 0))
            : 0;
        items.push({
          id: `hire-rent-${hireId}`,
          category: "rent",
          urgency: "urgent",
          title: "Rent payment overdue",
          description:
            due.unpaidPeriodCount > 1
              ? `${due.unpaidPeriodCount} rent periods remain unpaid.`
              : "Outstanding rent is overdue on this hire.",
          meta,
          dueStatusLabel: overdueRentDueLabel(daysPastEnd),
          dueStatusTone: "urgent",
          amountGbp: due.totalGbp,
          amountLabel: formatAttentionAmount(due.totalGbp),
          primaryActionLabel: "Record payment",
          primaryActionHref: `/rental/balances/${hireId}`,
          priority: attentionPriority({ urgency: "urgent", category: "rent" }),
          dueSortDays: -daysPastEnd,
          newestSortKey: due.oldestUnpaidPeriodEnd ?? todayYmd,
        });
      }
    } else if (status === "completed" || status === "terminated") {
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
          dueSortDays: 0,
          newestSortKey: todayYmd,
        });
      }
    }

    // Contract ending soon or already expired while hire still active
    if (status === "active") {
      const endDate = pickContractAttentionEndDate(agreements, todayYmd);
      if (endDate) {
        const days = daysFromCalendarDateToExpiry(endDate, todayYmd);
        if (days != null && days <= notifySettings.notify_contract_expiry_days_before) {
          const due = dueStatusForDaysRemaining(days);
          const urgency = days < 0 ? "urgent" : due.urgency;
          items.push({
            id: `hire-end-${hireId}`,
            category: "contracts",
            urgency,
            title:
              days < 0
                ? "Hire contract expired"
                : days <= 7
                  ? "Hire contract ending soon"
                  : "Contract review approaching",
            description:
              days < 0
                ? "The contract end date has passed while the hire is still active."
                : days <= 7
                  ? "Review extension or return arrangements with the driver."
                  : "Confirm whether the rolling hire should continue.",
            meta,
            dueStatusLabel: due.label,
            dueStatusTone: urgency === "urgent" ? "urgent" : due.tone,
            amountGbp: null,
            amountLabel: "—",
            primaryActionLabel: "Review contract",
            primaryActionHref: `/rental/hires/${hireId}`,
            priority: attentionPriority({ urgency, category: "contracts" }),
            dueSortDays: days,
            newestSortKey: endDate,
          });
        }
      }
    }

    // Hire insurance (only when responsibility is configured on the hire)
    if (["pending_signature", "reserved", "active"].includes(status)) {
      const providedByRaw = (hire.insurance_provided_by as string | null) ?? null;
      const providedBy =
        providedByRaw && isHireInsuranceProvidedBy(providedByRaw) ? providedByRaw : null;
      if (providedBy) {
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
          const insuranceDays =
            insuranceRow?.expiryDate != null
              ? (daysFromCalendarDateToExpiry(insuranceRow.expiryDate, todayYmd) ?? 0)
              : 0;
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
            dueSortDays: insuranceStatus === "awaiting_upload" ? 0 : insuranceDays,
            newestSortKey: insuranceRow?.expiryDate ?? todayYmd,
          });
        }
      }
    }

    // Unsigned live agreements on pre-active hires
    if (status === "pending_signature" || status === "reserved") {
      const unsigned = countUnsignedLiveAgreements(agreements);
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
          dueSortDays: 0,
          newestSortKey: todayYmd,
        });
      }
    }
  }

  // Open subcompany document-impact requirements (scoped hire must still exist here)
  const statusByHire = new Map(
    (hires ?? []).map((h) => [h.id as string, String(h.status ?? "")]),
  );
  for (const r of reqs ?? []) {
    const hireGroupId = r.hire_group_id as string;
    if (!hireIdSet.has(hireGroupId)) continue;
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
      dueSortDays: 0,
      newestSortKey: todayYmd,
    });
  }

  const uniqueItems = dedupeAttentionItemsById(items);
  uniqueItems.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  const summary = buildSubcompanyAttentionSummary(uniqueItems);

  return {
    ok: true,
    data: {
      subcompanyName: subcompany.name,
      summary,
      items: uniqueItems,
    },
  };
}

/** Lightweight open-count for the Attention tab badge (shares full attention cache). */
export async function loadSubcompanyAttentionOpenCount(
  companyId: string,
  subcompanyId: string,
): Promise<number> {
  const res = await getSubcompanyAttentionData(companyId, subcompanyId);
  if (!res.ok) return 0;
  return res.data.summary.openCount;
}

export const getSubcompanyAttentionData = cache(loadSubcompanyAttentionData);
export const getSubcompanyAttentionOpenCount = cache(loadSubcompanyAttentionOpenCount);
