"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { loadSubcompaniesPortfolioAction } from "@/app/actions/subcompanies-portfolio";
import type {
  SubcompanyPortfolioCard,
  SubcompanyPortfolioPayload,
} from "@/lib/rental/subcompanies-portfolio-display";
import { RegisterSubcompanyModal } from "./register-subcompany-modal";

function badgeClass(tone: SubcompanyPortfolioCard["tone"]): string {
  if (tone === "primary") return "subco-port-badge-primary";
  if (tone === "attention") return "subco-port-badge-attention";
  return "subco-port-badge-ok";
}

function OpenChevron() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PortfolioCardPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-rph-raised/85 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-7 w-7 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
        aria-hidden
      />
      <span className="text-sm font-medium text-rph-fg-secondary">Opening…</span>
    </div>
  );
}

function PortfolioCardOpenLabel() {
  const { pending } = useLinkStatus();
  return pending ? "Opening…" : "Open";
}

function PortfolioCard({ card }: { card: SubcompanyPortfolioCard }) {
  return (
    <Link
      href={card.href}
      className="subco-port-card rph-card relative"
      aria-label={`Open ${card.name}`}
    >
      <PortfolioCardPending />
      <div className="flex items-start justify-between gap-3">
        <div className="subco-port-avatar" aria-hidden>
          {card.initials}
        </div>
        <span className={`subco-port-badge ${badgeClass(card.tone)}`}>{card.badgeLabel}</span>
      </div>
      <div className="subco-port-card-body">
        <h2 className="mt-4 text-base font-semibold text-rph-fg">{card.name}</h2>
        <p className="mt-1 text-sm text-rph-fg-muted">{card.detail}</p>
      </div>
      <div className="subco-port-card-footer">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-rph-fg-secondary">
          <span>
            <span className="font-semibold tabular-nums text-rph-fg">{card.vehicleCount}</span> Vehicles
          </span>
          <span>
            <span className="font-semibold tabular-nums text-rph-fg">{card.activeHireCount}</span> Active
            hires
          </span>
        </div>
        <span className="rph-open-link" aria-hidden>
          <PortfolioCardOpenLabel />
          <OpenChevron />
        </span>
      </div>
    </Link>
  );
}

export function SubcompaniesView({
  canRegisterSubcompany,
  initialData = null,
  initialError = null,
}: {
  canRegisterSubcompany: boolean;
  initialData?: SubcompanyPortfolioPayload | null;
  initialError?: string | null;
}) {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<SubcompanyPortfolioPayload | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const skipSeededReload = useRef(Boolean(initialData));

  const reload = useCallback(() => {
    startTransition(() => {
      void (async () => {
        const res = await loadSubcompaniesPortfolioAction();
        if (!res.ok) {
          setError(res.error);
          setData(null);
          return;
        }
        setError(null);
        setData(res.data);
      })();
    });
  }, []);

  useEffect(() => {
    if (skipSeededReload.current) {
      skipSeededReload.current = false;
      return;
    }
    reload();
  }, [reload]);

  const summary = data?.summary;

  return (
    <div className="subco-port space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="rph-h1">Subcompanies</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm sm:text-[15px]">
            Manage every trading company without losing sight of its fleet, hires and compliance.
          </p>
          {!canRegisterSubcompany ? (
            <p className="mt-2 text-xs text-rph-fg-muted">
              You only see subcompanies your admin has granted. Ask an owner or admin to register new
              subcompanies or adjust your access.
            </p>
          ) : null}
        </div>
        {canRegisterSubcompany ? (
          <button
            type="button"
            className="rph-btn-primary w-full shrink-0 lg:mt-0.5 lg:w-auto"
            onClick={() => setRegisterOpen(true)}
          >
            Register subcompany
          </button>
        ) : null}
      </div>

      {canRegisterSubcompany ? (
        <RegisterSubcompanyModal
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          onRegistered={() => {
            reload();
          }}
        />
      ) : null}

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="subco-port-summary rph-card" aria-label="Portfolio summary">
        <div className="subco-port-summary-item">
          <span className="subco-port-summary-label">Companies</span>
          <span className="subco-port-summary-value">
            {pending && !summary ? "—" : (summary?.companyCount ?? 0)}
          </span>
        </div>
        <div className="subco-port-summary-item">
          <span className="subco-port-summary-label">Fleet vehicles</span>
          <span className="subco-port-summary-value">
            {pending && !summary ? "—" : (summary?.fleetVehicleCount ?? 0)}
          </span>
        </div>
        <div className="subco-port-summary-item">
          <span className="subco-port-summary-label">Active hires</span>
          <span className="subco-port-summary-value">
            {pending && !summary ? "—" : (summary?.activeHireCount ?? 0)}
          </span>
        </div>
        <div className="subco-port-summary-item">
          <span className="subco-port-summary-label">Needs attention</span>
          <span className="subco-port-summary-value subco-port-summary-attention">
            {pending && !summary ? "—" : (summary?.needsAttentionCount ?? 0)}
          </span>
        </div>
      </section>

      {pending && !data ? (
        <p className="text-sm text-rph-fg-muted">Loading subcompanies…</p>
      ) : null}

      {!pending && data && data.cards.length === 0 ? (
        <p className="text-sm text-rph-fg-muted">No subcompanies to show yet.</p>
      ) : null}

      {data && data.cards.length > 0 ? (
        <div className="subco-port-grid">
          {data.cards.map((card) => (
            <PortfolioCard key={card.id} card={card} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
