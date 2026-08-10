"use client";

import Link from "next/link";
import type { HireDashboardData } from "@/app/actions/hire-dashboard";

function formatHireProgressStamp(value: string | null | undefined): string {
  if (!value) return "—";
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}:\d{2})/);
  if (!match) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = Number.parseInt(match[1]!, 10);
  const month = months[Number.parseInt(match[2]!, 10) - 1] ?? match[2];
  return `${day} ${month} · ${match[4]}`;
}

function HireProgressCircle({
  state,
  index,
}: {
  state: "done" | "current" | "upcoming";
  index: number;
}) {
  return (
    <span
      className={`hire-ws-track-ring ${
        state === "done"
          ? "hire-ws-track-ring-done"
          : state === "current"
            ? "hire-ws-track-ring-current"
            : "hire-ws-track-ring-upcoming"
      }`}
    >
      <span
        className={`hire-ws-track-dot ${
          state === "done"
            ? "hire-ws-track-dot-done"
            : state === "current"
              ? "hire-ws-track-dot-current"
              : "hire-ws-track-dot-upcoming"
        }`}
      >
        {state === "done" ? (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          index + 1
        )}
      </span>
    </span>
  );
}

function HireProgressStepMarker({
  state,
  index,
  showVerticalLine,
}: {
  state: "done" | "current" | "upcoming";
  index: number;
  showVerticalLine: boolean;
}) {
  return (
    <div className="hire-ws-track-marker">
      <div className="hire-ws-track-node">
        <HireProgressCircle state={state} index={index} />
      </div>
      {showVerticalLine ? <span className="hire-ws-track-v-line" aria-hidden /> : null}
    </div>
  );
}

export function HireActiveSummaryProgress({
  lifecycle,
  hireGroupId,
  checkoutCompleted,
  checkoutCompletedAtLabel,
  activeSinceLabel,
  agreementsSigned,
  workspaceBase,
  audience = "staff",
}: {
  lifecycle: HireDashboardData["lifecycle"];
  hireGroupId: string;
  checkoutCompleted: boolean;
  checkoutCompletedAtLabel: string | null;
  activeSinceLabel: string;
  agreementsSigned: boolean;
  workspaceBase: string;
  audience?: "staff" | "driver";
}) {
  const checkoutHref = `${workspaceBase}/checkout`;
  const documentsSigned = agreementsSigned || lifecycle.documentsStatusLabel === "All signed";
  const steps = [
    {
      id: "signed",
      label: "Agreement signed",
      detail: documentsSigned ? formatHireProgressStamp(activeSinceLabel) : lifecycle.documentsStatusLabel,
      state: documentsSigned ? ("done" as const) : ("current" as const),
    },
    {
      id: "checkout",
      label: "Checkout completed",
      detail: checkoutCompleted
        ? formatHireProgressStamp(checkoutCompletedAtLabel)
        : audience === "driver"
          ? "Vehicle handover inspection"
          : "Handover inspection",
      state: checkoutCompleted
        ? ("done" as const)
        : documentsSigned
          ? ("current" as const)
          : ("upcoming" as const),
      href: checkoutHref,
    },
    {
      id: "active",
      label: "Hire active",
      detail:
        audience === "driver"
          ? "Keep payments and documents up to date"
          : "Payments and compliance monitored",
      state: checkoutCompleted ? ("current" as const) : ("upcoming" as const),
    },
    {
      id: "checkin",
      label: "Check-in & settlement",
      detail:
        audience === "driver"
          ? "Starts when your contract ends"
          : "Starts when the contract is ended",
      state: "upcoming" as const,
    },
  ];

  const progressHint = checkoutCompleted
    ? audience === "driver"
      ? "Checkout is complete. Check-in and settlement begin when your contract ends."
      : "Checkout is complete. Check-in and settlement will begin when the hire is ended."
    : documentsSigned
      ? audience === "driver"
        ? "Complete checkout to record the vehicle condition and activate your hire."
        : "Complete checkout to hand over the vehicle and activate the hire."
      : audience === "driver"
        ? "Sign your agreement and complete checkout to activate the hire."
        : "Sign the agreement and complete checkout to activate the hire.";

  return (
    <section className="hire-ws-compact-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-rph-fg">Hire progress</h2>
          <p className="mt-0.5 text-xs text-rph-fg-secondary">{progressHint}</p>
        </div>
        <Link
          href={checkoutHref}
          className="inline-flex h-8 items-center rounded-lg border border-rph-border bg-rph-raised px-3 text-xs font-semibold text-rph-fg shadow-sm transition-colors hover:bg-rph-chrome"
        >
          {audience === "driver" ? "Open checkout" : "View checkout"}
        </Link>
      </div>
      <ol className="hire-ws-track-mobile">
        {steps.map((step, index) => (
          <li key={step.id} className="hire-ws-track-step">
            <HireProgressStepMarker
              state={step.state}
              index={index}
              showVerticalLine={index < steps.length - 1}
            />
            <div className="hire-ws-track-text-mobile">
              <p className="hire-ws-track-label">{step.label}</p>
              <p className="hire-ws-track-detail">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <ol className="hire-ws-track-horizontal" aria-label="Hire progress">
        {steps.map((step, index) => (
          <li key={step.id} className="hire-ws-track-h-step">
            <div className="hire-ws-track-h-node">
              <HireProgressCircle state={step.state} index={index} />
            </div>
            <div className="hire-ws-track-h-segment">
              <p className="hire-ws-track-label hire-ws-track-h-label">{step.label}</p>
              <p className="hire-ws-track-detail hire-ws-track-h-detail">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
