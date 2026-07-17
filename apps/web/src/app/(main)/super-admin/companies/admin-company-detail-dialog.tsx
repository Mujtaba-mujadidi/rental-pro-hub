"use client";

import { useEffect, useId, useState } from "react";
import type { AdminCompanyDetailPayload } from "@/lib/admin/company-list-shared";

type DetailTabId = "company" | "contract" | "subcompanies";

function IconExpand({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function IconCollapse({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
    </svg>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M6 21V10l6-4 6 4v11M9 21v-4h6v4" />
      <path d="M9 10h1M14 10h1M9 14h1M14 14h1" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconChevronCard({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={`shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500 ${expanded ? "rotate-90" : ""} ${className ?? ""}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

const FIELD_LABELS: Record<string, string> = {
  id: "Company ID",
  name: "Name",
  legal_name: "Legal name",
  trading_name: "Trading name",
  entity_type: "Entity type",
  company_number: "Company number",
  country: "Country",
  status: "Status",
  contract_status: "Contract status (company)",
  contract_version: "Contract version",
  superseded_by_company_id: "Superseded by company ID",
  registered_address_line1: "Address line 1",
  registered_address_line2: "Address line 2",
  registered_town: "Town / city",
  registered_county: "County / region",
  registered_postcode: "Postcode",
  primary_contact_first_name: "First name",
  primary_contact_last_name: "Last name",
  primary_contact_dob: "Date of birth",
  primary_contact_email: "Email",
  primary_contact_phone: "Phone",
  primary_contact_user_id: "Linked user ID",
  billing_email: "Billing email",
  notes: "Notes",
  logo_storage_path: "Logo (storage path)",
  invite_last_sent_at: "Last invite sent",
  rental_onboarding_step: "Onboarding step",
  rental_onboarding_completed_at: "Onboarding completed",
  pending_primary_invite_after_contract_signed: "Pending invite after contract signed",
  created_at: "Created",
  updated_at: "Updated",
  parent_company_id: "Parent company ID",
  display_name: "Display name",
  is_primary: "Primary subcompany",
  contract_number: "Contract number",
  contract_type: "Contract type",
  pricing_model: "Pricing model",
  billing_frequency: "Billing frequency",
  start_date: "Start date",
  end_date: "End date",
  is_ongoing: "Ongoing",
  auto_renew: "Auto renew",
  notice_period_days: "Notice period (days)",
  currency: "Currency",
  payment_terms_days: "Payment terms (days)",
  billing_anchor_day: "Billing anchor day",
  contract_signed_at: "Contract signed at",
  terminated_at: "Terminated at",
  termination_reason: "Termination reason",
  internal_notes: "Internal notes",
  legacy_bootstrap_signed: "Legacy bootstrap signed",
  current_version_id: "Current version ID",
};

const COMPANY_KEY_PRIORITY = [
  "id",
  "name",
  "legal_name",
  "trading_name",
  "entity_type",
  "company_number",
  "country",
  "status",
  "contract_status",
  "contract_version",
  "superseded_by_company_id",
  "registered_address_line1",
  "registered_address_line2",
  "registered_town",
  "registered_county",
  "registered_postcode",
  "primary_contact_first_name",
  "primary_contact_last_name",
  "primary_contact_dob",
  "primary_contact_email",
  "primary_contact_phone",
  "primary_contact_user_id",
  "billing_email",
  "notes",
  "logo_storage_path",
  "invite_last_sent_at",
  "rental_onboarding_step",
  "rental_onboarding_completed_at",
  "pending_primary_invite_after_contract_signed",
  "created_at",
  "updated_at",
] as const;

const CONTRACT_KEY_PRIORITY = [
  "id",
  "status",
  "contract_number",
  "contract_type",
  "pricing_model",
  "billing_frequency",
  "start_date",
  "end_date",
  "is_ongoing",
  "auto_renew",
  "notice_period_days",
  "currency",
  "payment_terms_days",
  "billing_anchor_day",
  "contract_signed_at",
  "terminated_at",
  "termination_reason",
  "internal_notes",
  "legacy_bootstrap_signed",
  "current_version_id",
  "parent_company_id",
  "created_at",
  "updated_at",
] as const;

function labelForKey(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const t = Date.parse(value);
    if (!Number.isNaN(t) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        if (value.includes("T")) {
          return d.toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        return value.slice(0, 10);
      }
    }
    return value;
  }
  return JSON.stringify(value);
}

function orderedKeys(record: Record<string, unknown>, priority: readonly string[]): string[] {
  const keys = new Set(Object.keys(record));
  const out: string[] = [];
  for (const k of priority) {
    if (keys.has(k)) {
      out.push(k);
      keys.delete(k);
    }
  }
  out.push(...[...keys].sort());
  return out;
}

function DetailGrid({
  record,
  priority,
  embedded = false,
}: {
  record: Record<string, unknown>;
  priority: readonly string[];
  embedded?: boolean;
}) {
  const keys = orderedKeys(record, priority);
  const inner = (
    <dl className="divide-y divide-slate-100 dark:divide-slate-800/80">
      {keys.map((key) => (
        <div
          key={key}
          className="grid gap-1.5 px-4 py-3.5 transition-colors hover:bg-slate-50/80 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-start sm:gap-6 dark:hover:bg-slate-800/30"
        >
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {labelForKey(key)}
          </dt>
          <dd className="min-w-0 break-words text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-100">
            {formatDetailValue(record[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
  if (embedded) {
    return <div className="overflow-hidden rounded-xl">{inner}</div>;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/50 to-white shadow-sm dark:border-slate-700/90 dark:from-slate-900/50 dark:to-slate-950/40 dark:shadow-none">
      {inner}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/25">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint ? <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

export type AdminCompanyDetailDialogProps = {
  open: boolean;
  title: string;
  loading: boolean;
  error: string | null;
  payload: AdminCompanyDetailPayload | null;
  onClose: () => void;
};

const iconGhostBtn =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rph-rail/35 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900";

const tabSegBase =
  "min-h-10 flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-rph-rail/35 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 sm:px-4";
const tabSegInactive =
  "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200";
const tabSegActive =
  "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-700 dark:text-white dark:ring-slate-600/80";

export function AdminCompanyDetailDialog({ open, title, loading, error, payload, onClose }: AdminCompanyDetailDialogProps) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<DetailTabId>("company");
  const [expandedSubcompanyIds, setExpandedSubcompanyIds] = useState<Set<string>>(() => new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setActiveTab("company");
      setExpandedSubcompanyIds(new Set());
      setIsFullscreen(false);
    }
  }, [open]);

  if (!open) return null;

  const panelId = (tab: DetailTabId) => `${baseId}-panel-${tab}`;
  const tabId = (tab: DetailTabId) => `${baseId}-tab-${tab}`;

  const toggleSubcompanyExpanded = (subcompanyKey: string) => {
    setExpandedSubcompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(subcompanyKey)) next.delete(subcompanyKey);
      else next.add(subcompanyKey);
      return next;
    });
  };

  const outerClass = isFullscreen
    ? "fixed inset-0 z-[280] flex items-stretch justify-stretch p-0"
    : "fixed inset-0 z-[280] flex items-end justify-center p-0 sm:items-center sm:p-6";

  const shellClass = isFullscreen
    ? "relative z-[1] flex h-[100dvh] min-h-0 w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-white shadow-none dark:bg-slate-950"
    : "relative z-[1] flex h-[min(92vh,720px)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.35rem] border border-slate-200/90 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/5 dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.55)] dark:ring-white/5 sm:h-[min(85vh,720px)] sm:rounded-3xl";

  const headerClass = isFullscreen
    ? "flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-br from-white via-slate-50/40 to-slate-100/30 px-4 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/80 sm:px-6"
    : "flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-br from-white via-slate-50/40 to-slate-100/30 px-4 py-4 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/80 sm:rounded-t-3xl sm:px-6";

  return (
    <div className={outerClass}>
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[3px] transition-opacity dark:bg-black/60" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rph-company-detail-title"
        className={shellClass}
      >
        <div className={headerClass}>
          <div className="flex min-w-0 flex-1 gap-3.5">
            <div
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rph-rail/12 to-rph-rail/5 text-rph-rail shadow-inner shadow-white/20 dark:from-rph-rail-soft/20 dark:to-rph-rail-soft/5 dark:text-rph-rail-softer dark:shadow-black/20"
              aria-hidden
            >
              <IconBuilding className="opacity-90" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h2
                id="rph-company-detail-title"
                className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50"
              >
                {title}
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Directory record · Super-admin</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className={iconGhostBtn}
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Exit full screen" : "Full screen"}
              onClick={() => setIsFullscreen((v) => !v)}
            >
              {isFullscreen ? <IconCollapse /> : <IconExpand />}
              <span className="sr-only">{isFullscreen ? "Exit full screen" : "Full screen"}</span>
            </button>
            <button type="button" className={iconGhostBtn} title="Close" onClick={onClose}>
              <IconClose />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
            <div
              className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-rph-rail dark:border-slate-700 dark:border-t-rph-rail-softer"
              aria-hidden
            />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading company…</p>
          </div>
        ) : null}
        {!loading && error ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <div className="rph-alert-error rounded-xl px-4 py-3 text-sm">{error}</div>
          </div>
        ) : null}
        {!loading && !error && payload ? (
          <>
            <div role="tablist" aria-label="Company information sections" className="shrink-0 px-4 pb-3 pt-2 sm:px-6">
              <div className="flex w-full gap-1 rounded-2xl bg-slate-100/95 p-1.5 dark:bg-slate-800/90">
                <button
                  type="button"
                  role="tab"
                  id={tabId("company")}
                  aria-selected={activeTab === "company"}
                  aria-controls={panelId("company")}
                  tabIndex={activeTab === "company" ? 0 : -1}
                  className={`${tabSegBase} ${activeTab === "company" ? tabSegActive : tabSegInactive}`}
                  onClick={() => setActiveTab("company")}
                >
                  Company
                </button>
                <button
                  type="button"
                  role="tab"
                  id={tabId("contract")}
                  aria-selected={activeTab === "contract"}
                  aria-controls={panelId("contract")}
                  tabIndex={activeTab === "contract" ? 0 : -1}
                  className={`${tabSegBase} ${activeTab === "contract" ? tabSegActive : tabSegInactive}`}
                  onClick={() => setActiveTab("contract")}
                >
                  Contract
                </button>
                <button
                  type="button"
                  role="tab"
                  id={tabId("subcompanies")}
                  aria-selected={activeTab === "subcompanies"}
                  aria-controls={panelId("subcompanies")}
                  tabIndex={activeTab === "subcompanies" ? 0 : -1}
                  className={`${tabSegBase} ${activeTab === "subcompanies" ? tabSegActive : tabSegInactive}`}
                  onClick={() => setActiveTab("subcompanies")}
                >
                  <span className="whitespace-normal sm:whitespace-nowrap">Subcompanies ({payload.subcompanies.length})</span>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-1 sm:px-6">
              <div
                role="tabpanel"
                id={panelId("company")}
                aria-labelledby={tabId("company")}
                hidden={activeTab !== "company"}
              >
                <DetailGrid record={payload.company} priority={COMPANY_KEY_PRIORITY} />
              </div>
              <div
                role="tabpanel"
                id={panelId("contract")}
                aria-labelledby={tabId("contract")}
                hidden={activeTab !== "contract"}
              >
                {payload.companyContract ? (
                  <DetailGrid record={payload.companyContract} priority={CONTRACT_KEY_PRIORITY} />
                ) : (
                  <EmptyState
                    title="No contract on file"
                    hint="This parent company does not have a linked agreement record yet."
                  />
                )}
              </div>
              <div
                role="tabpanel"
                id={panelId("subcompanies")}
                aria-labelledby={tabId("subcompanies")}
                hidden={activeTab !== "subcompanies"}
              >
                {payload.subcompanies.length === 0 ? (
                  <EmptyState title="No subcompanies" hint="Branches or child entities will appear here when added." />
                ) : (
                  <ul className="flex flex-col gap-6">
                    {payload.subcompanies.map((sub, i) => {
                      const subKey = typeof sub.id === "string" ? sub.id : `sub-${i}`;
                      const subTitle =
                        (typeof sub.name === "string" && sub.name) ||
                        (typeof sub.display_name === "string" && sub.display_name) ||
                        `Subcompany ${i + 1}`;
                      const primary = sub.is_primary === true;
                      const expanded = expandedSubcompanyIds.has(subKey);
                      const triggerId = `${baseId}-sub-${subKey}-trigger`;
                      const detailsId = `${baseId}-sub-${subKey}-details`;
                      return (
                        <li
                          key={subKey}
                          className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700/90 dark:bg-slate-900/40 dark:shadow-none"
                        >
                          <button
                            type="button"
                            id={triggerId}
                            className="flex w-full items-center gap-3 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3.5 text-left transition-colors hover:from-slate-100/90 hover:to-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rph-rail/35 dark:from-slate-800/50 dark:to-slate-900/30 dark:hover:from-slate-800/70 dark:hover:to-slate-900/50"
                            aria-expanded={expanded}
                            aria-controls={detailsId}
                            onClick={() => toggleSubcompanyExpanded(subKey)}
                          >
                            <span
                              className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-rph-rail to-rph-rail/70 dark:from-rph-rail-soft dark:to-rph-rail-soft/60"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{subTitle}</p>
                              {typeof sub.legal_name === "string" && sub.legal_name && sub.legal_name !== subTitle ? (
                                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{sub.legal_name}</p>
                              ) : null}
                            </div>
                            {primary ? (
                              <span className="shrink-0 rounded-full bg-rph-rail/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-rph-rail dark:bg-rph-rail-soft/20 dark:text-rph-rail-softer">
                                Primary
                              </span>
                            ) : null}
                            <IconChevronCard expanded={expanded} className="shrink-0" />
                          </button>
                          <div
                            role="region"
                            id={detailsId}
                            aria-labelledby={triggerId}
                            hidden={!expanded}
                            className="border-t border-slate-100 dark:border-slate-800"
                          >
                            <div className="p-2 sm:p-3">
                              <DetailGrid embedded record={sub} priority={COMPANY_KEY_PRIORITY} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
