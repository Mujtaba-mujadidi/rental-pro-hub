"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadDriverDashboardAction } from "@/app/actions/driver-dashboard";
import { InsuranceDocumentIcon } from "@/components/fleet/insurance-document-icon";
import type {
  DriverDashboardKpi,
  DriverDashboardLicenceRow,
  DriverDashboardNextStep,
  DriverDashboardPayload,
  DriverDashboardUpdateItem,
} from "@/lib/fleet/driver-dashboard-display";

function kpiDotClass(tone: DriverDashboardKpi["tone"]): string {
  if (tone === "warn") return "bg-amber-500";
  if (tone === "ok") return "bg-emerald-500";
  if (tone === "info") return "bg-sky-500";
  return "bg-rph-fg-muted/40";
}

function kpiValueClass(tone: DriverDashboardKpi["tone"]): string {
  if (tone === "warn") return "text-amber-800 dark:text-amber-200";
  return "text-rph-fg";
}

function NextStepIcon({ step }: { step: DriverDashboardNextStep }) {
  if (step.icon === "pound") {
    return (
      <span className="driver-dash-step-icon driver-dash-step-icon-pound" aria-hidden>
        £
      </span>
    );
  }
  if (step.icon === "count" && step.iconCount != null) {
    return (
      <span className="driver-dash-step-icon driver-dash-step-icon-count" aria-hidden>
        {step.iconCount}
      </span>
    );
  }
  if (step.icon === "insurance") {
    return (
      <span className="driver-dash-step-icon driver-dash-step-icon-insurance" aria-hidden>
        <InsuranceDocumentIcon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="driver-dash-step-icon driver-dash-step-icon-warn" aria-hidden>
      !
    </span>
  );
}

function LicenceIcon({ tone }: { tone: DriverDashboardLicenceRow["tone"] }) {
  const wrap =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
      : tone === "danger"
        ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200"
        : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${wrap}`} aria-hidden>
      {tone === "ok" ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="text-sm font-bold">!</span>
      )}
    </span>
  );
}

function UpdateToneDot({ tone }: { tone: DriverDashboardUpdateItem["tone"] }) {
  const outer =
    tone === "ok"
      ? "bg-emerald-100 dark:bg-emerald-950/60"
      : tone === "warn"
        ? "bg-amber-100 dark:bg-amber-950/60"
        : tone === "info"
          ? "bg-sky-100 dark:bg-sky-950/60"
          : "bg-rph-chrome";
  const inner =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "info"
          ? "bg-sky-500"
          : "bg-rph-fg-muted";
  return (
    <span className={`driver-dash-update-dot relative z-[1] flex shrink-0 items-center justify-center rounded-full ${outer}`} aria-hidden>
      <span className={`h-2 w-2 rounded-full ${inner}`} />
    </span>
  );
}

export function DriverDashboardView() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<DriverDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await loadDriverDashboardAction();
      if (!res.ok) {
        if (res.redirectToOnboarding) {
          router.replace("/driver/onboarding");
          return;
        }
        setError(res.error);
        return;
      }
      setError(null);
      setData(res.data);
    });
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data && !error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading your dashboard…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="rph-alert-error text-sm">{error ?? "Could not load dashboard."}</p>
        <button type="button" className="rph-btn-ghost" disabled={pending} onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`driver-dash space-y-5 sm:space-y-6 ${pending ? "opacity-90" : ""}`}>
      <header className="space-y-1">
        <p className="driver-dash-kicker">{data.todayLabel}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-rph-fg sm:text-4xl">
          Hello, {data.greetingName}
        </h1>
        <p className="max-w-xl text-sm text-rph-fg-secondary sm:text-base">
          Your hire, payments and documents are all in one place.
        </p>
      </header>

      {data.activeHire ? (
        <section className="driver-dash-hire-hero">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="driver-dash-hire-initials" aria-hidden>
                  {data.activeHire.vrmInitials}
                </span>
                <span className="driver-dash-hire-pill">{data.activeHire.statusLabel}</span>
                {data.activeHire.fullySigned ? (
                  <span className="driver-dash-hire-pill driver-dash-hire-pill-ok">Fully signed</span>
                ) : null}
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {data.activeHire.vehicleVrm} · {data.activeHire.vehicleMakeModel}
              </h2>
              <p className="mt-1 text-sm text-white/70">
                {data.activeHire.companyName} · {data.activeHire.startedLabel}
              </p>
            </div>
            <Link
              href={data.activeHire.href}
              className="driver-dash-hire-cta inline-flex w-full shrink-0 items-center justify-center sm:w-auto"
            >
              Open my hire
            </Link>
          </div>
        </section>
      ) : (
        <section className="rph-card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-rph-fg">No active hire</h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            When a rental company starts a hire with you, it will show here.
          </p>
          <Link href="/driver/hire-requests" className="rph-btn-primary mt-4 inline-flex">
            View hire requests
          </Link>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((kpi) => {
          const inner = (
            <>
              <span className={`absolute right-3 top-3 h-2 w-2 rounded-full ${kpiDotClass(kpi.tone)}`} aria-hidden />
              <p className="pr-4 text-xs font-medium text-rph-fg-muted">{kpi.label}</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${kpiValueClass(kpi.tone)}`}>
                {kpi.value}
              </p>
              <p className="mt-1 text-xs text-rph-fg-secondary">{kpi.detail}</p>
            </>
          );
          const className = "driver-dash-kpi relative block rph-card p-4";
          return kpi.href ? (
            <Link key={kpi.id} href={kpi.href} className={`${className} transition hover:border-rph-border-strong`}>
              {inner}
            </Link>
          ) : (
            <div key={kpi.id} className={className}>
              {inner}
            </div>
          );
        })}
      </section>

      <div className="driver-dash-lower grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="driver-dash-panel rph-card flex flex-col p-4 sm:p-5">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <p className="driver-dash-section-label">Next steps</p>
              <h2 className="text-base font-semibold text-rph-fg">What you need to do</h2>
            </div>
            {data.nextSteps.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                {data.nextSteps.length} action{data.nextSteps.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          {data.nextSteps.length === 0 ? (
            <p className="mt-4 text-sm text-rph-fg-muted">Nothing needs your attention right now.</p>
          ) : (
            <ul className="driver-dash-panel-scroll mt-3 divide-y divide-rph-border">
              {data.nextSteps.map((step) => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className="flex items-start gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rph-rail"
                  >
                    <NextStepIcon step={step} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-rph-fg">{step.title}</span>
                      <span className="mt-0.5 block text-xs text-rph-fg-secondary">{step.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="driver-dash-side flex h-full min-h-0 flex-col gap-4">
          <section className="rph-card shrink-0 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="driver-dash-section-label">Documents</p>
                <h2 className="text-base font-semibold text-rph-fg">Your licence status</h2>
              </div>
              <Link href={data.documentsHref} className="rph-link shrink-0 text-sm font-medium">
                View documents
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-rph-border">
              {data.licences.map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <LicenceIcon tone={row.tone} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rph-fg">{row.label}</p>
                    <p className="text-xs text-rph-fg-secondary">{row.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="driver-dash-panel rph-card flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div>
                <p className="driver-dash-section-label">Updates</p>
                <h2 className="text-base font-semibold text-rph-fg">Recent activity</h2>
              </div>
              <Link href={data.notificationsHref} className="rph-link shrink-0 text-sm font-medium">
                All notifications
              </Link>
            </div>
            {data.updates.length === 0 ? (
              <p className="mt-4 text-sm text-rph-fg-muted">No recent notifications.</p>
            ) : (
              <ul className="driver-dash-updates driver-dash-panel-scroll mt-3">
                {data.updates.map((item) => {
                  const text = (
                    <>
                      <span className="block text-sm font-semibold text-rph-fg">{item.title}</span>
                      <span className="mt-0.5 block text-xs text-rph-fg-secondary">{item.detail}</span>
                    </>
                  );
                  return (
                    <li key={item.id} className="driver-dash-update-row relative flex gap-3">
                      <span className="driver-dash-updates-rail" aria-hidden />
                      <UpdateToneDot tone={item.tone} />
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="driver-dash-update-body min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rph-rail"
                        >
                          {text}
                        </Link>
                      ) : (
                        <div className="driver-dash-update-body min-w-0 flex-1">{text}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
