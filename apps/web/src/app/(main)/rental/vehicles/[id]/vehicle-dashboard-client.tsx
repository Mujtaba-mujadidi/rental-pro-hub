"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useVehicleWorkspace } from "@/app/(main)/rental/vehicles/[id]/vehicle-workspace-provider";
import { RphOpenLink } from "@/components/ui/rph-open-link";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  assessVehicleExpiries,
  vehicleExpiryAttentionItems,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import { formatUkDateText, formatUkDateTextLong } from "@/lib/datetime/uk";
import { vehicleNextComplianceLabel } from "@/lib/rental/subcompany-fleet-display";
import type { VehicleDocumentRow, VehicleStatus } from "@/lib/fleet/vehicles";
import { isPhvTaxiLicencePaperDocType } from "@/lib/fleet/vehicles";

function fleetStatusLabel(status: VehicleStatus): string {
  if (status === "on_rent") return "On hire";
  if (status === "available") return "Available";
  if (status === "reserved") return "Reserved";
  if (status === "repair") return "Repair";
  if (status === "accident_claim") return "Accident claim";
  if (status === "sold") return "Sold";
  return status;
}

function rentCadenceLabel(cadence: string): string {
  if (cadence === "daily") return "per day";
  if (cadence === "weekly") return "per week";
  if (cadence === "monthly") return "per month";
  return cadence;
}

function latestDoc(
  documents: VehicleDocumentRow[],
  match: (docType: string) => boolean,
): VehicleDocumentRow | null {
  const matches = documents.filter((d) => match(d.doc_type));
  if (!matches.length) return null;
  return [...matches].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

type ComplianceRow = {
  key: string;
  title: string;
  detail: string;
  badge: string;
  ok: boolean;
};

function buildComplianceRows(
  vehicle: {
    mot_expiry?: string | null;
    missing_docs?: string[];
  },
  documents: VehicleDocumentRow[],
  notifySettings: Parameters<typeof assessVehicleExpiries>[1],
): ComplianceRow[] {
  const missing = new Set(vehicle.missing_docs ?? []);
  const motAssess = assessVehicleExpiries(vehicle, notifySettings).find((i) => i.kind === "mot");
  const motDoc = latestDoc(documents, (t) => t === "mot");
  const logbookDoc = latestDoc(documents, (t) => t === "logbook");
  const phvDoc = latestDoc(documents, (t) => isPhvTaxiLicencePaperDocType(t));

  const motOk = !missing.has("mot") && motAssess?.tone !== "expired";
  const motDetail =
    motAssess?.isoDate != null
      ? `Current until ${formatUkDateTextLong(motAssess.isoDate)}`
      : motDoc
        ? `Uploaded ${formatUkDateTextLong(motDoc.created_at.slice(0, 10))}`
        : "MOT certificate not on file";

  const logbookOk = !missing.has("logbook");
  const logbookDetail = logbookDoc
    ? `Uploaded ${formatUkDateTextLong(logbookDoc.created_at.slice(0, 10))}`
    : "V5C logbook not on file";

  const phvAssess = assessVehicleExpiries(vehicle, notifySettings).find((i) => i.kind === "phv");
  const phvOk = !missing.has("phv_taxi_licence_paper") && phvAssess?.tone !== "expired";
  const phvDetail =
    phvAssess?.isoDate != null
      ? `Current until ${formatUkDateTextLong(phvAssess.isoDate)}`
      : phvDoc
        ? `Uploaded ${formatUkDateTextLong(phvDoc.created_at.slice(0, 10))}`
        : "PHV/Taxi licence paper not on file";

  return [
    {
      key: "mot",
      title: "MOT certificate",
      detail: motDetail,
      badge: motAssess?.tone === "expired" ? "Expired" : motOk ? "Current" : "Missing",
      ok: motOk,
    },
    {
      key: "logbook",
      title: "V5C logbook",
      detail: logbookDetail,
      badge: logbookOk ? "Complete" : "Missing",
      ok: logbookOk,
    },
    {
      key: "phv",
      title: "PHV vehicle licence",
      detail: phvDetail,
      badge: phvAssess?.tone === "expired" ? "Expired" : phvOk ? "Current" : "Missing",
      ok: phvOk,
    },
  ];
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "info" | "success" | "warn" | "danger";
}) {
  const dot =
    tone === "info"
      ? "bg-sky-500"
      : tone === "success"
        ? "bg-emerald-500"
        : tone === "warn"
          ? "bg-amber-500"
          : tone === "danger"
            ? "bg-red-500"
            : "bg-rph-fg-muted/50";
  return (
    <div className="rph-card relative px-4 py-3.5">
      <span className={`absolute right-3.5 top-3.5 h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <p className="text-xs font-medium text-rph-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rph-fg sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-rph-fg-muted">{hint}</p>
    </div>
  );
}

function ComplianceIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.63-1.515 2.63H3.72c-1.347 0-2.188-1.463-1.515-2.63L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

export function VehicleDashboardClient() {
  const { shell, financials, ensureFinancials, overview, ensureOverview } = useVehicleWorkspace();
  const { vehicle, documents, notifySettings } = shell;

  useEffect(() => {
    void ensureFinancials();
    void ensureOverview();
  }, [ensureFinancials, ensureOverview]);

  const pnl = financials.data?.pnl ?? null;
  const currentHire = overview.data?.currentHire ?? null;
  const attention = vehicleExpiryAttentionItems(vehicle, notifySettings);
  const expiryTone = worstVehicleExpiryTone(attention);
  const nextCompliance = vehicleNextComplianceLabel(vehicle);

  const complianceRows = useMemo(
    () => buildComplianceRows(vehicle, documents, notifySettings),
    [vehicle, documents, notifySettings],
  );

  const nextExpiry = useMemo(() => {
    return [...assessVehicleExpiries(vehicle, notifySettings)]
      .filter((i) => i.isoDate)
      .sort((a, b) => (a.isoDate ?? "").localeCompare(b.isoDate ?? ""))[0] ?? null;
  }, [vehicle, notifySettings]);

  const nextComplianceValue =
    nextExpiry?.isoDate != null ? formatUkDateText(nextExpiry.isoDate) : nextCompliance === "—" ? "—" : nextCompliance;

  const nextComplianceHint = useMemo(() => {
    if (!nextExpiry || nextExpiry.daysUntil == null) return "No upcoming compliance date";
    if (nextExpiry.tone === "expired" || nextExpiry.tone === "expiring") return nextExpiry.message;
    const months = Math.max(1, Math.round(nextExpiry.daysUntil / 30));
    return `${nextExpiry.label} due in ${months} month${months === 1 ? "" : "s"}`;
  }, [nextExpiry]);

  const statusHint = currentHire?.startDate
    ? `Started ${formatUkDateTextLong(currentHire.startDate)}`
    : vehicle.subcompany_name ?? "—";

  const monthlyValue =
    currentHire != null
      ? formatGbp(currentHire.monthlyIncomeGbp)
      : overview.loading
        ? "…"
        : "—";

  const netContributionValue =
    pnl == null
      ? financials.loading
        ? "…"
        : "—"
      : pnl.isSold && pnl.netPnlGbp != null
        ? formatGbp(pnl.netPnlGbp)
        : pnl.bookPositionGbp != null
          ? formatGbp(pnl.bookPositionGbp)
          : "—";

  const netContributionLabel = pnl?.isSold ? "Net P&L" : "Book position";
  const netContributionHint = pnl?.isSold
    ? "Lifetime net after sale"
    : pnl?.hasPurchase
      ? "Purchase + costs − hire income"
      : "Record purchase on Financials";

  const hirePeriod =
    currentHire == null
      ? "—"
      : currentHire.endDate
        ? `${formatUkDateText(currentHire.startDate)} — ${formatUkDateText(currentHire.endDate)}`
        : `${formatUkDateText(currentHire.startDate)} — Ongoing`;

  const statusTone =
    vehicle.status === "on_rent" || vehicle.status === "reserved"
      ? "info"
      : vehicle.status === "available"
        ? "success"
        : vehicle.status === "repair" || vehicle.status === "accident_claim"
          ? "warn"
          : "neutral";

  const complianceTone =
    expiryTone === "expired" ? "danger" : expiryTone === "expiring" ? "warn" : "neutral";

  const bookTone =
    pnl == null
      ? "neutral"
      : pnl.isSold
        ? (pnl.netPnlGbp ?? 0) >= 0
          ? "success"
          : "warn"
        : (pnl.bookPositionGbp ?? 0) > 0
          ? "warn"
          : pnl.hasPurchase
            ? "success"
            : "neutral";

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Current status"
          value={fleetStatusLabel(vehicle.status)}
          hint={statusHint}
          tone={statusTone}
        />
        <MetricCard
          label="Monthly hire income"
          value={monthlyValue}
          hint={currentHire ? "Estimate · current UK month" : "No active hire"}
          tone={currentHire ? "success" : "neutral"}
        />
        <MetricCard
          label="Next compliance"
          value={nextComplianceValue}
          hint={nextComplianceHint}
          tone={complianceTone}
        />
        <MetricCard
          label={netContributionLabel}
          value={netContributionValue}
          hint={netContributionHint}
          tone={bookTone}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rph-card flex flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-rph-fg">Compliance &amp; documents</h2>
            <RphOpenLink href={`/rental/vehicles/${vehicle.id}/details#documents`} size="sm" withChevron={false}>
              Manage
            </RphOpenLink>
          </div>
          <ul className="mt-4 space-y-3">
            {complianceRows.map((row) => (
              <li key={row.key} className="flex items-start gap-3">
                <ComplianceIcon ok={row.ok} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-rph-fg">{row.title}</p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        row.ok
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                      }`}
                    >
                      {row.badge}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-rph-fg-muted">{row.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rph-card flex flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-rph-fg">Current hire</h2>
            {currentHire ? (
              <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                {currentHire.status === "active"
                  ? "Active"
                  : currentHire.status === "reserved"
                    ? "Reserved"
                    : currentHire.status === "pending_signature"
                      ? "Pending signature"
                      : "Draft"}
              </span>
            ) : null}
          </div>

          {overview.loading && !currentHire ? (
            <p className="rph-muted mt-4 text-sm">Loading hire…</p>
          ) : !currentHire ? (
            <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-rph-fg-muted">No current hire on this vehicle.</p>
              <Link
                href={`/rental/vehicles/${vehicle.id}/rentals`}
                className="rph-btn-ghost inline-flex h-10 w-full items-center justify-center sm:ml-auto sm:w-auto"
              >
                View hires
              </Link>
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
              <dl className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-rph-fg-muted">Driver</dt>
                  <dd className="text-right font-medium text-rph-fg">{currentHire.driverLabel}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-rph-fg-muted">Hire period</dt>
                  <dd className="text-right font-medium text-rph-fg">{hirePeriod}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-rph-fg-muted">Rent</dt>
                  <dd className="text-right font-medium text-rph-fg">
                    {formatGbp(currentHire.rentAmountGbp)} {rentCadenceLabel(currentHire.rentCadence)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-rph-fg-muted">Agreement</dt>
                  <dd className="text-right font-medium text-rph-fg">{currentHire.agreementLabel}</dd>
                </div>
              </dl>
              <Link
                href={`/rental/hires/${currentHire.hireGroupId}`}
                className="rph-btn-ghost inline-flex h-10 w-full items-center justify-center sm:ml-auto sm:w-auto"
              >
                View hire
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
