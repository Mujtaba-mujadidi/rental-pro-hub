"use client";

import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import { DriverHireDashboardSection } from "./driver-hire-dashboard-section";
import { DriverHireDetailsSection } from "./driver-hire-details-section";
import { DriverHirePaymentsSection } from "./driver-hire-payments-section";
import { useDriverMyHire } from "./driver-my-hire-provider";
import { useDriverHireAccessRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type DriverHireTab = "overview" | "details" | "payments";

const DRIVER_HIRE_TABS: { id: DriverHireTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments" },
  { id: "details", label: "Details" },
];

function parseDriverHireTab(value: string | null): DriverHireTab | null {
  if (value === "overview" || value === "details" || value === "payments") return value;
  return null;
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
      <p className="text-sm text-rph-fg-secondary">{label}</p>
    </div>
  );
}

function StatusPill({ label, status }: { label: string; status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(driverHireStatusTone(status))}`}
    >
      {label}
    </span>
  );
}

function MyHireCard({ hireGroupId }: { hireGroupId: string }) {
  const { shell } = useDriverMyHire();
  const searchParams = useSearchParams();
  const summary = shell.data?.find((row) => row.hireGroupId === hireGroupId);
  const [tab, setTab] = useState<DriverHireTab>("overview");

  useEffect(() => {
    const hireFromUrl = searchParams.get("hire");
    if (hireFromUrl && hireFromUrl !== hireGroupId) return;
    const tabFromUrl = parseDriverHireTab(searchParams.get("tab"));
    if (tabFromUrl) setTab(tabFromUrl);
  }, [hireGroupId, searchParams]);

  if (!summary) return null;

  return (
    <article className="rph-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-medium text-rph-fg">{summary.companyName}</p>
          <p className="rph-meta text-sm">
            {summary.vehicleVrm} · {summary.vehicleMakeModel}
          </p>
        </div>
        <StatusPill label={summary.statusLabel} status={summary.status} />
      </div>

      <nav
        className="overflow-x-auto overscroll-x-contain border-t border-rph-border px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Hire sections"
      >
        <div className="flex w-max gap-1 py-2">
          {DRIVER_HIRE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "rph-pill-active" : "rph-pill"}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="border-t border-rph-border p-4">
        {tab === "overview" ? (
          <DriverHireDashboardSection
            hireGroupId={hireGroupId}
            hireStatusLabel={summary.statusLabel}
            startDateLabel={summary.startDateLabel}
            rentLabel={summary.rentLabel}
            onOpenPayments={() => setTab("payments")}
          />
        ) : null}
        {tab === "payments" ? <DriverHirePaymentsSection hireGroupId={hireGroupId} /> : null}
        {tab === "details" ? <DriverHireDetailsSection hireGroupId={hireGroupId} /> : null}
      </div>
    </article>
  );
}

export function DriverMyHireClient() {
  const { shell, reloadShell } = useDriverMyHire();

  const refresh = useCallback(() => {
    void reloadShell();
  }, [reloadShell]);

  useEffect(() => {
    void reloadShell();
  }, [reloadShell]);

  useDriverHireAccessRealtime(refresh);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="rph-h1">My hire</h1>
          <p className="rph-muted mt-1 text-sm">Your current vehicle hire with a rental company.</p>
        </div>
        <button type="button" className="rph-btn-ghost" disabled={shell.loading} onClick={refresh}>
          Refresh
        </button>
      </div>

      {shell.loading && !shell.data ? <LoadingPanel label="Loading your hire…" /> : null}
      {shell.error ? <p className="rph-alert-error text-sm">{shell.error}</p> : null}

      {shell.data && !shell.data.length ? (
        <p className="rph-muted text-sm">
          You do not have an active hire right now. Check{" "}
          <Link href="/driver/hire-requests" className="rph-link-inline">
            Hire requests
          </Link>{" "}
          for contracts waiting to be signed.
        </p>
      ) : null}

      {shell.data?.map((row) => (
        <MyHireCard key={row.hireGroupId} hireGroupId={row.hireGroupId} />
      ))}
    </div>
  );
}
