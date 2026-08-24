"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HireContractWizardModal } from "@/app/(main)/rental/hires/hire-contract-wizard-modal";
import type { SubcompanySwitcherOption } from "@/app/actions/rental-subcompany-workspace";
import { PageLoading } from "@/components/ui/page-loading";
import { subcompanyInitials } from "@/lib/rental/subcompanies-portfolio-display";
import { formatSubcompanyAddressLines } from "@/lib/rental/subcompany-legal-snapshot";
import {
  isSubcompanyWorkspaceNavItemActive,
  parseSubcompanyWorkspaceSection,
  subcompanyWorkspaceHref,
  subcompanyWorkspaceNav,
} from "@/lib/rental/subcompany-workspace-nav";
import { SUBCOMPANY_STATUS_LABELS } from "./subcompany-status-chip";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

function headerMetaLine(input: {
  company_number: string | null;
  registered_address_line1?: string | null;
  registered_address_line2?: string | null;
  registered_town: string | null;
  registered_county?: string | null;
  registered_postcode?: string | null;
  country: string | null;
}): string {
  const parts: string[] = [];
  if (input.company_number?.trim()) {
    parts.push(`Company number ${input.company_number.trim()}`);
  }
  const address = formatSubcompanyAddressLines(input);
  const place = [address, input.country?.trim()].filter(Boolean).join(", ");
  if (place) parts.push(place);
  return parts.join(" · ");
}

export function SubcompanyWorkspaceTopBar({
  subcompanies,
  attentionBadge = null,
}: {
  subcompanies: SubcompanySwitcherOption[];
  /** Server-streamed Attention count badge (optional). */
  attentionBadge?: ReactNode;
}) {
  const { shell, refreshShell, section, navigateSection } = useSubcompanyWorkspace();
  const subcompany = shell.subcompany;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSection = parseSubcompanyWorkspaceSection(pathname, subcompany.id, searchParams.get("section"));
  const activeSection = section ?? urlSection;
  const items = subcompanyWorkspaceNav(subcompany.id);
  const initials = subcompanyInitials(subcompany.name);
  const meta = headerMetaLine(subcompany);
  const typeBadge = subcompany.is_primary ? "Main company" : "Subcompany";

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hireOpen, setHireOpen] = useState(false);
  const [switchingToId, setSwitchingToId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSwitchingToId(null);
  }, [subcompany.id]);

  useEffect(() => {
    if (!switcherOpen) return;
    inputRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setSwitcherOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSwitcherOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [switcherOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subcompanies;
    return subcompanies.filter((s) => s.name.toLowerCase().includes(q));
  }, [subcompanies, query]);

  const switchingName =
    switchingToId != null
      ? (subcompanies.find((s) => s.id === switchingToId)?.name ?? "subcompany")
      : null;

  function switchTo(id: string) {
    setSwitcherOpen(false);
    setQuery("");
    if (id === subcompany.id) return;
    setSwitchingToId(id);
    router.push(subcompanyWorkspaceHref(id, activeSection));
  }

  return (
    <div className="subco-ws-chrome mb-5 space-y-4">
      {switchingToId ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-rph-page/70 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <PageLoading label={`Opening ${switchingName}…`} />
        </div>
      ) : null}

      <Link href="/rental/subcompany" className="subco-ws-back">
        <IconArrowLeft className="h-3.5 w-3.5 shrink-0" />
        Back to subcompanies
      </Link>

      <section className="subco-ws-hero rph-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="subco-ws-avatar" aria-hidden>
              {shell.logoSignedUrl ? (
                <Image
                  src={shell.logoSignedUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="subco-ws-badge subco-ws-badge-status">
                  {SUBCOMPANY_STATUS_LABELS[subcompany.status]}
                </span>
                <span className="subco-ws-badge subco-ws-badge-type">{typeBadge}</span>
                {subcompanies.length > 1 ? (
                  <div className="relative" ref={rootRef}>
                    <button
                      type="button"
                      className="subco-ws-switcher-btn"
                      aria-expanded={switcherOpen}
                      aria-haspopup="listbox"
                      onClick={() => setSwitcherOpen((v) => !v)}
                    >
                      Switch
                      <span aria-hidden>▾</span>
                    </button>
                    {switcherOpen ? (
                      <div className="subco-ws-switcher-menu">
                        <div className="border-b border-rph-border p-2">
                          <input
                            ref={inputRef}
                            className="rph-input py-1.5"
                            placeholder="Search subcompanies…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </div>
                        <ul className="max-h-64 overflow-y-auto overscroll-contain py-1" role="listbox">
                          {!filtered.length ? (
                            <li className="px-3 py-2 text-sm text-rph-fg-muted">No subcompanies match.</li>
                          ) : (
                            filtered.map((s) => {
                              const active = s.id === subcompany.id;
                              return (
                                <li key={s.id}>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    className={[
                                      "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm sm:py-2",
                                      active
                                        ? "bg-rph-rail/10 font-semibold text-sky-700 dark:text-sky-300"
                                        : "text-rph-fg hover:bg-rph-chrome",
                                    ].join(" ")}
                                    onClick={() => switchTo(s.id)}
                                  >
                                    <span className="min-w-0 truncate">
                                      <span className="font-semibold">{s.name}</span>
                                      {s.isPrimary ? (
                                        <span className="text-rph-fg-muted"> · Main</span>
                                      ) : null}
                                    </span>
                                  </button>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <h1 className="subco-ws-title">{subcompany.name}</h1>
              {meta ? <p className="subco-ws-meta">{meta}</p> : null}
            </div>
          </div>

          {shell.canWriteRentals ? (
            <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto">
              <button
                type="button"
                className="rph-btn-primary w-full sm:w-auto"
                onClick={() => setHireOpen(true)}
              >
                Create hire
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <nav className="subco-ws-tabs" aria-label="Subcompany sections">
        <div className="subco-ws-tabs-track">
          {items.map((item) => {
            const active = isSubcompanyWorkspaceNavItemActive(activeSection, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                scroll={false}
                prefetch
                onClick={(e) => {
                  e.preventDefault();
                  navigateSection(item.section);
                }}
                className={active ? "subco-ws-tab subco-ws-tab-active" : "subco-ws-tab"}
              >
                <span>{item.label}</span>
                {item.section === "attention" ? attentionBadge : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {shell.canWriteRentals ? (
        <HireContractWizardModal
          open={hireOpen}
          hireGroupId={null}
          subcompanyId={subcompany.id}
          onClose={() => setHireOpen(false)}
          onSaved={() => {
            setHireOpen(false);
            refreshShell();
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function IconArrowLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}
