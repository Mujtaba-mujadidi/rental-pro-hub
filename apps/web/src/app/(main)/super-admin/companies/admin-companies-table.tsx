"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyLatestCompanyContractChangeAction,
  reactivateCompanyAction,
  sendCompanyPrimaryInviteAction,
  sendPrimaryContactPasswordResetAction,
  startCompanyOffboardingAction,
} from "@/app/actions/admin-companies";
import { prepareCompanyContractForEsignAction } from "@/app/actions/contract-signature";
import { getCompanySignedEsignEnvelopeAction } from "@/app/actions/esign";
import { getAdminCompaniesPageAction, getAdminCompanyDetailAction, getPrimaryContactSignedInAction } from "@/app/actions/admin-companies-list";
import { AdminCompanyDetailDialog } from "@/app/(main)/super-admin/companies/admin-company-detail-dialog";
import type { AdminCompanyDetailPayload } from "@/lib/admin/company-list-shared";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { AdminCompanyListRow } from "@/lib/admin/company-list-shared";
import type { CompanyListStatusFilter } from "@/lib/admin/companies-query";

const btn =
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50";
const btnNeutral =
  "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

const thBtn =
  "inline-flex items-center gap-0.5 font-semibold text-slate-900 hover:text-slate-600 dark:text-slate-100 dark:hover:text-slate-300";

const rowActionTriggerClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 data-[state=open]:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:data-[state=open]:bg-slate-800";

const rowActionContentClass =
  "z-[200] min-w-[12.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900";

const rowActionItemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-slate-800 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800";

const rowActionDeleteClass = `${rowActionItemClass} text-red-700 dark:text-red-300`;

/** Strong red row action (force delete during offboarding). */
const rowActionForceDeleteClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm font-semibold text-red-700 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-red-100 data-[highlighted]:text-red-900 dark:text-red-300 dark:data-[highlighted]:bg-red-950/55 dark:data-[highlighted]:text-red-50";

const PAGE_SIZES = [10, 25, 50, 100] as const;

async function streamCompanyPermanentDelete(
  companyId: string,
  variant: "offboarding_force" | "access_blocked",
  onStep: (message: string) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/super-admin/company-permanent-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, variant }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    return { ok: false, error: errText.trim() || `Request failed (${res.status})` };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return { ok: false, error: "No response stream." };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let streamError: string | null = null;
  let sawDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let msg: { step?: string; error?: string; done?: boolean };
      try {
        msg = JSON.parse(t) as { step?: string; error?: string; done?: boolean };
      } catch {
        continue;
      }
      if (typeof msg.error === "string") streamError = msg.error;
      if (typeof msg.step === "string") onStep(msg.step);
      if (msg.done === true) sawDone = true;
    }
  }

  const tail = buffer.trim();
  if (tail) {
    try {
      const msg = JSON.parse(tail) as { step?: string; error?: string; done?: boolean };
      if (typeof msg.error === "string") streamError = msg.error;
      if (typeof msg.step === "string") onStep(msg.step);
      if (msg.done === true) sawDone = true;
    } catch {
      /* ignore */
    }
  }

  if (streamError) return { ok: false, error: streamError };
  if (sawDone) return { ok: true };
  return { ok: false, error: "Delete did not complete. Check the network response and server logs." };
}

const selectTriggerClass =
  "flex h-10 w-full min-w-[8.5rem] cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50/80 focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 data-[state=open]:border-rph-rail/70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800/80 dark:focus:border-rph-rail-softer dark:focus:ring-rph-rail-soft/30 dark:data-[state=open]:border-rph-rail-softer";

const selectContentClass =
  "z-[200] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900";

const selectItemClass =
  "relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm text-slate-800 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800 dark:data-[highlighted]:text-slate-100";

const selectItemIndicatorWrap = "absolute left-2 flex h-4 w-4 items-center justify-center text-slate-600 dark:text-slate-400";

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconKebabVertical({ className }: { className?: string }) {
  return (
    <svg className={className} width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  );
}

const STATUS_LABELS: Record<CompanyListStatusFilter, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
};

const toolbarFieldLabel =
  "mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200";

type LifecycleConfirm =
  | { mode: "offboarding"; companyId: string; label: string }
  | { mode: "reactivate"; companyId: string; label: string }
  | { mode: "force_delete"; companyId: string; label: string }
  | { mode: "purge"; companyId: string; label: string }
  | null;

function formatInviteSent(iso: string | null): string {
  if (!iso) return "—";
  return formatRegisteredAt(iso);
}

function formatRegisteredAt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deletionPhaseBadge(phase: AdminCompanyListRow["deletionPhase"]) {
  if (phase === "offboarding") {
    return (
      <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
        Offboarding
      </span>
    );
  }
  if (phase === "access_blocked") {
    return (
      <span className="w-fit rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-950 dark:border-red-900/45 dark:bg-red-950/35 dark:text-red-100">
        Access blocked
      </span>
    );
  }
  return (
    <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
      Active
    </span>
  );
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "inactive") {
    return (
      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
        Inactive
      </span>
    );
  }
  if (s === "pending") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
        Pending
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-100">
      Active
    </span>
  );
}

function SortGlyph({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <span aria-hidden>↑</span>;
  if (state === "desc") return <span aria-hidden>↓</span>;
  return null;
}

export function AdminCompaniesTable({
  listVersion = 0,
  onListChange,
}: {
  listVersion?: number;
  onListChange?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AdminCompanyListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string | null>(null);
  const [contractBusyId, setContractBusyId] = useState<string | null>(null);
  const [eSignBusyId, setESignBusyId] = useState<string | null>(null);
  const [eSignOverlay, setESignOverlay] = useState<{ title: string; detail: string } | null>(null);
  const [actionOverlay, setActionOverlay] = useState<ActionStatusOverlayState | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [earlyInviteConfirm, setEarlyInviteConfirm] = useState<{
    companyId: string;
    label: string;
    emailLabel: string;
  } | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState<LifecycleConfirm>(null);
  const [purgeOverlay, setPurgeOverlay] = useState<{
    title: string;
    lines: string[];
    error: string | null;
    pending: boolean;
  } | null>(null);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailPayload, setDetailPayload] = useState<AdminCompanyDetailPayload | null>(null);
  /** Cache Auth last-sign-in checks by user id (filled when a row menu opens). */
  const [signedInByUserId, setSignedInByUserId] = useState<Record<string, boolean>>({});
  const [signedInLoadingUserId, setSignedInLoadingUserId] = useState<string | null>(null);
  const signedInByUserIdRef = useRef(signedInByUserId);
  const signedInInflightRef = useRef(new Set<string>());
  signedInByUserIdRef.current = signedInByUserId;

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompanyListStatusFilter>("all");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPageIndex(0);
  }, [debouncedSearch, statusFilter, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const sort = sorting[0];
    const sortBy = sort?.id ?? "created_at";
    const sortDir = sort?.desc ? "desc" : "asc";
    const res = await getAdminCompaniesPageAction({
      page: pageIndex + 1,
      pageSize,
      search: debouncedSearch,
      sortBy,
      sortDir,
      status: statusFilter,
    });
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error);
      setRows([]);
      setTotal(0);
      return;
    }
    const maxIdx = Math.max(0, Math.ceil(res.total / pageSize) - 1);
    if (res.total > 0 && pageIndex > maxIdx) {
      setTotal(res.total);
      setPageIndex(maxIdx);
      return;
    }
    setRows(res.rows);
    setTotal(res.total);
  }, [pageIndex, pageSize, debouncedSearch, sorting, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load, listVersion]);

  const finishActionOverlay = useCallback((next: ActionStatusOverlayState, refresh?: boolean) => {
    setActionOverlay(next);
    if (next.phase === "success") {
      if (refresh) onListChange?.();
      window.setTimeout(() => setActionOverlay(null), 2200);
    }
  }, [onListChange]);

  const doPrimaryInvite = useCallback(
    async (companyId: string, emailLabel: string) => {
      setInviteFeedback(null);
      setInviteBusyId(companyId);
      setActionOverlay({
        phase: "pending",
        title: "Sending invite…",
        detail: `Emailing ${emailLabel}. Please wait.`,
      });
      const res = await sendCompanyPrimaryInviteAction(companyId);
      setInviteBusyId(null);
      if (!res.ok) {
        finishActionOverlay({
          phase: "error",
          title: "Invite failed",
          detail: res.error,
        });
        return;
      }
      finishActionOverlay(
        {
          phase: "success",
          title: "Invite sent",
          detail: `An invite email was sent to ${emailLabel}.`,
        },
        true,
      );
    },
    [finishActionOverlay],
  );

  const doPasswordReset = useCallback(
    async (companyId: string, emailLabel: string) => {
      setInviteFeedback(null);
      setInviteBusyId(companyId);
      setActionOverlay({
        phase: "pending",
        title: "Sending password reset…",
        detail: `Emailing a reset link to ${emailLabel}. Please wait.`,
      });
      const res = await sendPrimaryContactPasswordResetAction(companyId);
      setInviteBusyId(null);
      if (!res.ok) {
        finishActionOverlay({
          phase: "error",
          title: "Password reset failed",
          detail: res.error,
        });
        return;
      }
      finishActionOverlay(
        {
          phase: "success",
          title: "Password reset email sent",
          detail: `A reset link was sent to ${emailLabel}.`,
        },
        true,
      );
    },
    [finishActionOverlay],
  );

  const ensurePrimarySignedInStatus = useCallback(async (userId: string | null) => {
    const uid = userId?.trim();
    if (!uid) return;
    if (Object.prototype.hasOwnProperty.call(signedInByUserIdRef.current, uid)) return;
    if (signedInInflightRef.current.has(uid)) return;

    signedInInflightRef.current.add(uid);
    setSignedInLoadingUserId(uid);
    try {
      const res = await getPrimaryContactSignedInAction(uid);
      setSignedInByUserId((prev) => ({
        ...prev,
        [uid]: res.ok ? res.hasSignedIn : false,
      }));
    } finally {
      signedInInflightRef.current.delete(uid);
      setSignedInLoadingUserId((cur) => (cur === uid ? null : cur));
    }
  }, []);

  const resolvePrimarySignedIn = useCallback(
    (r: AdminCompanyListRow): boolean | null => {
      const uid = r.primaryContactUserId?.trim();
      if (!uid) return false;
      if (Object.prototype.hasOwnProperty.call(signedInByUserId, uid)) {
        return signedInByUserId[uid] ?? false;
      }
      return null;
    },
    [signedInByUserId],
  );

  const onConfirmLifecycle = useCallback(async () => {
    const ctx = lifecycleConfirm;
    if (!ctx) return;
    setInviteFeedback(null);
    setLifecycleBusyId(ctx.companyId);
    try {
      if (ctx.mode === "offboarding") {
        const res = await startCompanyOffboardingAction(ctx.companyId);
        if (!res.ok) {
          setInviteFeedback(res.error);
          return;
        }
        const displayLabel = ctx.label === "this company" ? ctx.label : `"${ctx.label}"`;
        setInviteFeedback(`Offboarding started for ${displayLabel}.`);
        onListChange?.();
        return;
      }
      if (ctx.mode === "reactivate") {
        const res = await reactivateCompanyAction(ctx.companyId);
        if (!res.ok) {
          setInviteFeedback(res.error);
          return;
        }
        const displayLabel = ctx.label === "this company" ? ctx.label : `"${ctx.label}"`;
        setInviteFeedback(`Reactivated ${displayLabel}.`);
        onListChange?.();
        return;
      }
      if (ctx.mode === "force_delete" || ctx.mode === "purge") {
        const variant = ctx.mode === "force_delete" ? "offboarding_force" : "access_blocked";
        const displayLabel = ctx.label === "this company" ? ctx.label : `"${ctx.label}"`;
        const title =
          ctx.mode === "force_delete" ? `Force deleting ${displayLabel}` : `Permanently deleting ${displayLabel}`;
        setLifecycleConfirm(null);
        setPurgeOverlay({ title, lines: [], error: null, pending: true });
        const lines: string[] = [];
        const res = await streamCompanyPermanentDelete(ctx.companyId, variant, (step) => {
          lines.push(step);
          setPurgeOverlay((prev) => (prev ? { ...prev, lines: [...lines] } : null));
        });
        if (!res.ok) {
          setPurgeOverlay({ title, lines, error: res.error, pending: false });
          setInviteFeedback(res.error);
          return;
        }
        setPurgeOverlay({ title, lines, error: null, pending: false });
        setInviteFeedback(
          ctx.mode === "force_delete"
            ? `Force deleted ${displayLabel} (retention skipped).`
            : `Permanently deleted ${displayLabel}.`,
        );
        onListChange?.();
        window.setTimeout(() => setPurgeOverlay(null), 900);
        return;
      }
    } finally {
      setLifecycleBusyId(null);
      setLifecycleConfirm(null);
    }
  }, [lifecycleConfirm, onListChange]);

  const columns = useMemo<ColumnDef<AdminCompanyListRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Company
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => {
          const r = info.row.original;
          return (
            <div className="min-w-[10rem] max-w-[16rem]">
              <div className="font-medium text-slate-900 dark:text-slate-100">{r.name || "—"}</div>
              {r.legalName ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">{r.legalName}</div>
              ) : null}
              {r.deletionPhase === "offboarding" || r.deletionPhase === "access_blocked" ? (
                <div className="mt-1 flex flex-col gap-0.5">
                  {deletionPhaseBadge(r.deletionPhase)}
                  {r.deletionPhase === "offboarding" && r.offboardingEndsAt ? (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Until {formatRegisteredAt(r.offboardingEndsAt)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "company_number",
        accessorKey: "companyNumber",
        header: "Co. number",
        enableSorting: false,
        cell: (info) => (
          <span className="whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300">
            {String(info.getValue() || "—")}
          </span>
        ),
      },
      {
        id: "contact",
        header: "Primary contact",
        enableSorting: false,
        cell: (info) => {
          const r = info.row.original;
          const full = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ");
          return (
            <div>
              <div className="text-slate-900 dark:text-slate-100">{full || "—"}</div>
            </div>
          );
        },
      },
      {
        id: "primary_contact_email",
        accessorKey: "email",
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Email
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => {
          const v = info.getValue() as string | null;
          return (
            <span className="max-w-[200px] truncate text-slate-700 dark:text-slate-300" title={v ?? ""}>
              {v ?? "—"}
            </span>
          );
        },
      },
      {
        id: "phone",
        accessorKey: "phone",
        header: "Phone",
        enableSorting: false,
        cell: (info) => String(info.getValue() || "—"),
      },
      {
        id: "logo",
        accessorKey: "hasLogo",
        header: "Logo",
        enableSorting: false,
        cell: (info) =>
          info.getValue() ? (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Yes</span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Status
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => statusBadge(String(info.getValue() ?? "")),
      },
      {
        id: "contract_status",
        accessorKey: "contractStatus",
        header: "Contract",
        enableSorting: false,
        cell: (info) => {
          const r = info.row.original;
          const account = String(r.contractStatus ?? "").toLowerCase();
          const ag = (r.agreementContractStatus ?? "").toLowerCase();

          let agreementLabel = "No agreement";
          let agreementClass =
            "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300";
          if (ag === "active") {
            agreementLabel = "Contract signed";
            agreementClass =
              "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-100";
          } else if (ag === "sent_for_signature") {
            agreementLabel = "Awaiting signature";
            agreementClass =
              "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100";
          } else if (ag === "draft") {
            agreementLabel = "Pending e-sign";
            agreementClass =
              "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/45 dark:bg-sky-950/35 dark:text-sky-100";
          } else if (ag) {
            agreementLabel = ag.replaceAll("_", " ");
            agreementClass =
              "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300";
          }

          return (
            <div className="flex flex-col gap-1">
              <span className={`w-fit rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${agreementClass}`}>
                {agreementLabel}
              </span>
              {account === "pending_renewal" ? (
                <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
                  Renewal pending
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "created_at",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Added
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => (
          <span className="whitespace-nowrap text-slate-600 dark:text-slate-400">
            {formatRegisteredAt(String(info.getValue() ?? ""))}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: (info) => {
          const r = info.row.original;
          const inviteBusy = inviteBusyId === r.id;
          const lifecycleBusy = lifecycleBusyId === r.id;
          const contractBusy = contractBusyId === r.id;
          const eSignBusy = eSignBusyId === r.id;
          const busy = inviteBusy || lifecycleBusy || contractBusy || eSignBusy;
          const lifecycleActive = r.deletionPhase === "active";
          const primarySignedIn = resolvePrimarySignedIn(r);
          return (
            <DropdownMenu.Root
              onOpenChange={(open) => {
                if (open) void ensurePrimarySignedInStatus(r.primaryContactUserId);
              }}
            >
              <DropdownMenu.Trigger asChild>
                <button type="button" className={rowActionTriggerClass} disabled={busy} aria-label="Row actions" title="Actions">
                  <IconKebabVertical />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="bottom"
                  align="end"
                  sideOffset={6}
                  alignOffset={0}
                  collisionPadding={12}
                  className={rowActionContentClass}
                >
                  <DropdownMenu.Item
                    className={rowActionItemClass}
                    disabled={busy}
                    onSelect={() => {
                      setDetailCompanyId(r.id);
                      setDetailTitle(r.name?.trim() || "Company");
                      setDetailLoading(true);
                      setDetailError(null);
                      setDetailPayload(null);
                      void (async () => {
                        const res = await getAdminCompanyDetailAction(r.id);
                        setDetailLoading(false);
                        if (!res.ok) {
                          setDetailError(res.error);
                          return;
                        }
                        setDetailPayload(res.payload);
                      })();
                    }}
                  >
                    View company details
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={rowActionItemClass} disabled>
                    Last invite: {formatInviteSent(r.inviteLastSentAt)}
                  </DropdownMenu.Item>
                  {r.agreementContractStatus === "draft" && lifecycleActive ? (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy}
                      onSelect={() => {
                        setInviteFeedback(null);
                        setESignBusyId(r.id);
                        setESignOverlay({
                          title: "Preparing e-signature",
                          detail: "Generating the contract PDF and opening the designer…",
                        });
                        void (async () => {
                          const res = await prepareCompanyContractForEsignAction(r.id);
                          if (!res.ok) {
                            setESignBusyId(null);
                            setESignOverlay(null);
                            setInviteFeedback(res.error);
                            return;
                          }
                          router.push(`/super-admin/esign/${res.envelopeId}`);
                          // Keep overlay until navigation; clear shortly after push
                          window.setTimeout(() => {
                            setESignBusyId(null);
                            setESignOverlay(null);
                          }, 800);
                        })();
                      }}
                    >
                      {eSignBusy ? "Preparing…" : "Prepare contract for e-sign"}
                    </DropdownMenu.Item>
                  ) : null}
                  {r.agreementContractStatus === "active" ? (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy}
                      onSelect={() => {
                        setInviteFeedback(null);
                        setESignBusyId(r.id);
                        setESignOverlay({
                          title: "Opening signed contract",
                          detail: "Loading the signed PDF…",
                        });
                        void (async () => {
                          const res = await getCompanySignedEsignEnvelopeAction(r.id);
                          if (!res.ok) {
                            setESignBusyId(null);
                            setESignOverlay(null);
                            setInviteFeedback(res.error);
                            return;
                          }
                          router.push(`/super-admin/esign/${res.envelopeId}`);
                          window.setTimeout(() => {
                            setESignBusyId(null);
                            setESignOverlay(null);
                          }, 800);
                        })();
                      }}
                    >
                      {eSignBusy ? "Opening…" : "View signed contract"}
                    </DropdownMenu.Item>
                  ) : null}
                  {r.contractStatus === "pending_renewal" && lifecycleActive ? (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy}
                      onSelect={() => {
                        setInviteFeedback(null);
                        setContractBusyId(r.id);
                        setActionOverlay({
                          phase: "pending",
                          title: "Applying contract change…",
                          detail: "Updating the company agreement. Please wait.",
                        });
                        void (async () => {
                          const res = await applyLatestCompanyContractChangeAction(r.id);
                          setContractBusyId(null);
                          if (!res.ok) {
                            finishActionOverlay({
                              phase: "error",
                              title: "Could not apply contract change",
                              detail: res.error,
                            });
                            return;
                          }
                          finishActionOverlay(
                            {
                              phase: "success",
                              title: "Contract updated",
                              detail: `Contract change applied for ${r.name || "company"}.`,
                            },
                            true,
                          );
                        })();
                      }}
                    >
                      {contractBusy ? "Applying…" : "Mark contract signed"}
                    </DropdownMenu.Item>
                  ) : null}
                  {primarySignedIn === null && r.primaryContactUserId ? (
                    <DropdownMenu.Item className={rowActionItemClass} disabled>
                      Checking account…
                    </DropdownMenu.Item>
                  ) : primarySignedIn ? (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy || !r.email || !lifecycleActive}
                      title={
                        !lifecycleActive
                          ? "Not available during offboarding"
                          : !r.email
                            ? "No email on file"
                            : undefined
                      }
                      onSelect={() => {
                        void doPasswordReset(r.id, r.email ?? "primary contact");
                      }}
                    >
                      {inviteBusy ? "Sending…" : "Reset password"}
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy || !r.email || !lifecycleActive}
                      title={
                        !lifecycleActive
                          ? "Not available during offboarding"
                          : !r.email
                            ? "No email on file"
                            : r.agreementContractStatus !== "active"
                              ? "Standard: invite after contract is active; confirms if used early"
                              : undefined
                      }
                      onSelect={() => {
                        const emailLabel = r.email ?? "primary contact";
                        if (lifecycleActive && r.email && r.agreementContractStatus !== "active") {
                          setEarlyInviteConfirm({
                            companyId: r.id,
                            label: r.name?.trim() || "this company",
                            emailLabel,
                          });
                          return;
                        }
                        void doPrimaryInvite(r.id, emailLabel);
                      }}
                    >
                      {inviteBusy ? "Sending…" : r.inviteLastSentAt ? "Resend invite" : "Send invite"}
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
                  {lifecycleActive ? (
                    <DropdownMenu.Item
                      className={rowActionDeleteClass}
                      disabled={busy}
                      onSelect={() => {
                        setLifecycleConfirm({
                          mode: "offboarding",
                          companyId: r.id,
                          label: r.name?.trim() || "this company",
                        });
                      }}
                    >
                      Start offboarding (6-month window)
                    </DropdownMenu.Item>
                  ) : null}
                  {r.deletionPhase === "offboarding" || r.deletionPhase === "access_blocked" ? (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy}
                      onSelect={() => {
                        setLifecycleConfirm({
                          mode: "reactivate",
                          companyId: r.id,
                          label: r.name?.trim() || "this company",
                        });
                      }}
                    >
                      Reactivate company
                    </DropdownMenu.Item>
                  ) : null}
                  {r.deletionPhase === "offboarding" ? (
                    <DropdownMenu.Item
                      className={rowActionForceDeleteClass}
                      disabled={busy}
                      onSelect={() => {
                        setLifecycleConfirm({
                          mode: "force_delete",
                          companyId: r.id,
                          label: r.name?.trim() || "this company",
                        });
                      }}
                    >
                      Force delete now (skip retention wait)
                    </DropdownMenu.Item>
                  ) : null}
                  {r.deletionPhase === "access_blocked" ? (
                    <DropdownMenu.Item
                      className={rowActionDeleteClass}
                      disabled={busy}
                      onSelect={() => {
                        setLifecycleConfirm({
                          mode: "purge",
                          companyId: r.id,
                          label: r.name?.trim() || "this company",
                        });
                      }}
                    >
                      Permanently delete company
                    </DropdownMenu.Item>
                  ) : null}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        },
      },
    ],
    [inviteBusyId, lifecycleBusyId, contractBusyId, eSignBusyId, onListChange, doPrimaryInvite, doPasswordReset, finishActionOverlay, ensurePrimarySignedInStatus, resolvePrimarySignedIn, signedInLoadingUserId],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize } },
    manualPagination: true,
    manualSorting: true,
    pageCount,
    onSortingChange: (updater) => {
      setSorting(updater);
      setPageIndex(0);
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const fromRow = total === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min((pageIndex + 1) * pageSize, total);
  const lc = lifecycleConfirm;
  const lcDisplayLabel = lc ? (lc.label === "this company" ? lc.label : `"${lc.label}"`) : "this company";

  const lifecycleConfirmTitle =
    lc?.mode === "offboarding"
      ? "Start company offboarding?"
      : lc?.mode === "reactivate"
        ? "Reactivate company?"
        : lc?.mode === "force_delete"
          ? "Force delete tenant now?"
          : lc?.mode === "purge"
            ? "Permanently delete company?"
            : "";

  const lifecycleConfirmDescription =
    lc?.mode === "offboarding"
      ? `Start offboarding for ${lcDisplayLabel}? A full data snapshot is archived, the contract is terminated, and rental users get a 6-month window with export-only access. After that, access is blocked until you purge or reactivate.`
      : lc?.mode === "reactivate"
        ? `Reactivate ${lcDisplayLabel}? Offboarding state is cleared, onboarding is reset, and the agreement returns to draft for a new contract flow.`
        : lc?.mode === "force_delete"
          ? `Force delete ${lcDisplayLabel} now without waiting for the retention window? Tenant Auth users are removed and the company row is deleted (related data cascades). The archive from offboarding start is kept. This cannot be undone.`
          : lc?.mode === "purge"
            ? `Permanently delete ${lcDisplayLabel}? Tenant users are removed from Auth and the company row is deleted. This cannot be undone. A prior archive from offboarding is retained.`
            : "";

  const lifecycleConfirmButtonLabel =
    lc?.mode === "offboarding"
      ? "Start offboarding"
      : lc?.mode === "reactivate"
        ? "Reactivate"
        : lc?.mode === "force_delete"
          ? "Force delete now"
          : lc?.mode === "purge"
            ? "Delete permanently"
            : "Confirm";

  const hasFilters = debouncedSearch.length > 0 || statusFilter !== "all";

  return (
    <div className="space-y-3">
      {loadError ? <p className="rph-alert-error">{loadError}</p> : null}
      {eSignOverlay ? (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={eSignOverlay.title}
        >
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-2xl dark:border-slate-600 dark:bg-slate-900">
            <span
              className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-rph-rail dark:border-slate-600 dark:border-t-sky-400"
              aria-hidden
            />
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{eSignOverlay.title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{eSignOverlay.detail}</p>
            </div>
          </div>
        </div>
      ) : null}
      <ActionStatusOverlay
        state={actionOverlay}
        onDismiss={() => setActionOverlay(null)}
      />
      {purgeOverlay ? (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
          role="alertdialog"
          aria-busy={purgeOverlay.pending}
          aria-label={purgeOverlay.title}
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-900">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{purgeOverlay.title}</h2>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {purgeOverlay.pending
                ? "Keep this page open until the process finishes."
                : purgeOverlay.error
                  ? "The delete did not complete."
                  : "Done."}
            </p>
            <ul className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {purgeOverlay.lines.map((line, i) => (
                <li
                  key={`${i}-${line.slice(0, 24)}`}
                  className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800"
                >
                  {line}
                </li>
              ))}
            </ul>
            {purgeOverlay.error ? (
              <p className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">{purgeOverlay.error}</p>
            ) : null}
            {purgeOverlay.pending ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span
                  className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-rph-rail dark:border-slate-600"
                  aria-hidden
                />
                In progress…
              </div>
            ) : purgeOverlay.error ? (
              <button
                type="button"
                className="mt-6 w-full rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setPurgeOverlay(null)}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {inviteFeedback ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
          {inviteFeedback}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4 sm:gap-y-3">
        <label className="min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-xl">
          <span className={toolbarFieldLabel}>Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, email, phone, town, postcode, company no.…"
            className="rph-input-auth shadow-sm"
          />
        </label>

        <div className="shrink-0 sm:w-[11rem]">
          <span className={toolbarFieldLabel}>Status</span>
          <Select.Root value={statusFilter} onValueChange={(v) => setStatusFilter(v as CompanyListStatusFilter)}>
            <Select.Trigger className={selectTriggerClass} aria-label="Filter by status">
              <Select.Value>{STATUS_LABELS[statusFilter]}</Select.Value>
              <Select.Icon className="shrink-0 text-slate-500 dark:text-slate-400">
                <IconChevronDown />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                className={selectContentClass}
                position="popper"
                side="bottom"
                sideOffset={6}
                align="start"
                collisionPadding={16}
              >
                <Select.Viewport className="px-1">
                  {(["all", "active", "inactive", "pending"] as const).map((value) => (
                    <Select.Item key={value} value={value} className={selectItemClass}>
                      <span className={selectItemIndicatorWrap}>
                        <Select.ItemIndicator>
                          <IconCheck />
                        </Select.ItemIndicator>
                      </span>
                      <Select.ItemText>{STATUS_LABELS[value]}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div className="shrink-0 sm:w-[7.5rem]">
          <span className={toolbarFieldLabel}>Rows</span>
          <Select.Root
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPageIndex(0);
            }}
          >
            <Select.Trigger className={selectTriggerClass} aria-label="Rows per page">
              <Select.Value>{pageSize}</Select.Value>
              <Select.Icon className="shrink-0 text-slate-500 dark:text-slate-400">
                <IconChevronDown />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                className={selectContentClass}
                position="popper"
                side="bottom"
                sideOffset={6}
                align="start"
                collisionPadding={16}
              >
                <Select.Viewport className="px-1">
                  {PAGE_SIZES.map((n) => (
                    <Select.Item key={n} value={String(n)} className={selectItemClass}>
                      <span className={selectItemIndicatorWrap}>
                        <Select.ItemIndicator>
                          <IconCheck />
                        </Select.ItemIndicator>
                      </span>
                      <Select.ItemText>{n}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {loading && rows.length === 0 ? (
          <span>Loading companies…</span>
        ) : (
          <>
            Showing {fromRow}–{toRow} of {total}
            {loading ? " · Updating…" : ""}
          </>
        )}
      </p>

      {!loading && total === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          {hasFilters ? "No companies match your filters." : "No companies yet. Register one to get started."}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          {loading ? (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/75 dark:bg-slate-950/75"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <span
                className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-300 border-t-rph-rail dark:border-slate-600 dark:border-t-sky-400"
                aria-hidden
              />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Loading companies…</p>
            </div>
          ) : null}
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr
                  key={hg.id}
                  className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  {hg.headers.map((h) => {
                    const sticky = h.column.id === "name";
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        className={`px-4 py-3 ${
                          sticky
                            ? "sticky left-0 z-10 border-r border-slate-200 bg-slate-50 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)]"
                            : ""
                        }`}
                      >
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading && rows.length === 0
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={`skel-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                        <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                      </td>
                      <td className="px-4 py-3" colSpan={8}>
                        <div className="h-4 w-full max-w-md animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                      </td>
                    </tr>
                  ))
                : table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="group border-b border-slate-100 last:border-0 dark:border-slate-800 odd:bg-white even:bg-slate-50/80 dark:odd:bg-slate-900 dark:even:bg-slate-900/80"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const sticky = cell.column.id === "name";
                        return (
                          <td
                            key={cell.id}
                            className={`px-4 py-3 text-slate-700 dark:text-slate-300 ${
                              sticky
                                ? "sticky left-0 z-10 border-r border-slate-200 bg-white shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] group-odd:bg-white group-even:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)] dark:group-odd:bg-slate-900 dark:group-even:bg-slate-950"
                                : ""
                            }`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${btn} ${btnNeutral} min-h-9`}
            disabled={loading || !table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </button>
          <button
            type="button"
            className={`${btn} ${btnNeutral} min-h-9`}
            disabled={loading || !table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {pageIndex + 1} of {pageCount}
          </span>
        </div>
      ) : null}
      <ConfirmDialog
        open={lc !== null}
        title={lifecycleConfirmTitle}
        description={lifecycleConfirmDescription}
        confirmLabel={lifecycleConfirmButtonLabel}
        cancelLabel="Cancel"
        variant={lc?.mode === "reactivate" || lc?.mode === "offboarding" ? "default" : "danger"}
        pending={lc !== null && lifecycleBusyId === lc.companyId}
        onCancel={() => {
          if (lifecycleBusyId) return;
          setLifecycleConfirm(null);
        }}
        onConfirm={onConfirmLifecycle}
      />
      <ConfirmDialog
        open={earlyInviteConfirm !== null}
        title="Invite before the agreement is active?"
        description={
          earlyInviteConfirm
            ? `The agreement for ${
                earlyInviteConfirm.label === "this company"
                  ? earlyInviteConfirm.label
                  : `"${earlyInviteConfirm.label}"`
              } is not active yet. Normally the primary contact is invited after signing. If e-sign is blocked, you can still send an invite—they will see a holding screen until the contract becomes active, then onboarding.`
            : ""
        }
        confirmLabel="Send invite anyway"
        cancelLabel="Cancel"
        variant="default"
        pending={earlyInviteConfirm !== null && inviteBusyId === earlyInviteConfirm.companyId}
        onCancel={() => {
          if (inviteBusyId) return;
          setEarlyInviteConfirm(null);
        }}
        onConfirm={async () => {
          const ctx = earlyInviteConfirm;
          if (!ctx) return;
          setEarlyInviteConfirm(null);
          await doPrimaryInvite(ctx.companyId, ctx.emailLabel);
        }}
      />
      <AdminCompanyDetailDialog
        open={detailCompanyId !== null}
        title={detailTitle ? `${detailTitle} — details` : "Company details"}
        loading={detailLoading}
        error={detailError}
        payload={detailPayload}
        onClose={() => {
          setDetailCompanyId(null);
          setDetailTitle("");
          setDetailLoading(false);
          setDetailError(null);
          setDetailPayload(null);
        }}
      />
    </div>
  );
}
