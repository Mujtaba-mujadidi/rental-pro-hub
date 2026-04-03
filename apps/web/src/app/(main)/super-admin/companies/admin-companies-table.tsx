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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyLatestCompanyContractChangeAction,
  deleteCompanyAction,
  sendCompanyPrimaryInviteAction,
} from "@/app/actions/admin-companies";
import { sendCompanyContractForSignatureAction } from "@/app/actions/contract-signature";
import { getAdminCompaniesPageAction, getAdminCompanyDetailAction } from "@/app/actions/admin-companies-list";
import { AdminCompanyDetailDialog } from "@/app/(main)/super-admin/companies/admin-company-detail-dialog";
import type { AdminCompanyDetailPayload } from "@/lib/admin/company-list-shared";
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

const PAGE_SIZES = [10, 25, 50, 100] as const;

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

type CompanyDeleteConfirmState = { companyId: string; label: string } | null;

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
  const [rows, setRows] = useState<AdminCompanyListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [contractBusyId, setContractBusyId] = useState<string | null>(null);
  const [eSignBusyId, setESignBusyId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CompanyDeleteConfirmState>(null);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailPayload, setDetailPayload] = useState<AdminCompanyDetailPayload | null>(null);

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

  const onConfirmDelete = useCallback(async () => {
    const ctx = confirmDelete;
    if (!ctx) return;
    setInviteFeedback(null);
    setDeleteBusyId(ctx.companyId);
    try {
      const res = await deleteCompanyAction(ctx.companyId);
      if (!res.ok) {
        setInviteFeedback(res.error);
        return;
      }
      const displayLabel = ctx.label === "this company" ? ctx.label : `"${ctx.label}"`;
      setInviteFeedback(`Deleted ${displayLabel}.`);
      onListChange?.();
    } finally {
      setDeleteBusyId(null);
      setConfirmDelete(null);
    }
  }, [confirmDelete, onListChange]);

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
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100">{r.name || "—"}</div>
              {r.legalName ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">{r.legalName}</div>
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
          const v = String(r.contractStatus ?? "active").toLowerCase();
          const ag = r.agreementContractStatus;
          return (
            <div className="flex flex-col gap-1">
              {v === "pending_renewal" ? (
                <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100">
                  Pending renewal
                </span>
              ) : (
                <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-100">
                  Account OK
                </span>
              )}
              {ag ? (
                <span className="text-[11px] capitalize text-slate-500 dark:text-slate-400">Agreement: {ag}</span>
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
          const deleteBusy = deleteBusyId === r.id;
          const contractBusy = contractBusyId === r.id;
          const eSignBusy = eSignBusyId === r.id;
          const busy = inviteBusy || deleteBusy || contractBusy || eSignBusy;
          return (
            <DropdownMenu.Root>
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
                  {r.agreementContractStatus === "draft" ? (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy}
                      onSelect={() => {
                        setInviteFeedback(null);
                        setESignBusyId(r.id);
                        void (async () => {
                          const res = await sendCompanyContractForSignatureAction(r.id);
                          setESignBusyId(null);
                          if (!res.ok) {
                            setInviteFeedback(res.error);
                            return;
                          }
                          setInviteFeedback(`E-sign request sent for ${r.name || "company"}.`);
                          onListChange?.();
                        })();
                      }}
                    >
                      {eSignBusy ? "Sending…" : "Send contract for e-sign (DocuSeal)"}
                    </DropdownMenu.Item>
                  ) : null}
                  {r.contractStatus === "pending_renewal" ? (
                    <DropdownMenu.Item
                      className={rowActionItemClass}
                      disabled={busy}
                      onSelect={() => {
                        setInviteFeedback(null);
                        setContractBusyId(r.id);
                        void (async () => {
                          const res = await applyLatestCompanyContractChangeAction(r.id);
                          setContractBusyId(null);
                          if (!res.ok) {
                            setInviteFeedback(res.error);
                            return;
                          }
                          setInviteFeedback(`Contract change applied for ${r.name || "company"}.`);
                          onListChange?.();
                        })();
                      }}
                    >
                      {contractBusy ? "Applying…" : "Mark contract signed"}
                    </DropdownMenu.Item>
                  ) : null}
                  <DropdownMenu.Item
                    className={rowActionItemClass}
                    disabled={busy || !r.email}
                    title={!r.email ? "No email on file" : undefined}
                    onSelect={() => {
                      setInviteFeedback(null);
                      setInviteBusyId(r.id);
                      void (async () => {
                        const res = await sendCompanyPrimaryInviteAction(r.id);
                        setInviteBusyId(null);
                        if (!res.ok) {
                          setInviteFeedback(res.error);
                          return;
                        }
                        setInviteFeedback(`Invite sent to ${r.email ?? "primary contact"}.`);
                        onListChange?.();
                      })();
                    }}
                  >
                    {inviteBusy ? "Sending…" : r.inviteLastSentAt ? "Resend invite" : "Send invite"}
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
                  <DropdownMenu.Item
                    className={rowActionDeleteClass}
                    disabled={busy}
                    onSelect={() => {
                      setConfirmDelete({
                        companyId: r.id,
                        label: r.name?.trim() || "this company",
                      });
                    }}
                  >
                    {deleteBusy ? "Deleting…" : "Delete company"}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        },
      },
    ],
    [inviteBusyId, deleteBusyId, contractBusyId, eSignBusyId, onListChange],
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
  const confirmDeleteLabel = confirmDelete
    ? confirmDelete.label === "this company"
      ? confirmDelete.label
      : `"${confirmDelete.label}"`
    : "this company";

  const hasFilters = debouncedSearch.length > 0 || statusFilter !== "all";

  return (
    <div className="space-y-3">
      {loadError ? <p className="rph-alert-error">{loadError}</p> : null}
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
        {loading ? (
          <span>Loading…</span>
        ) : (
          <>
            Showing {fromRow}–{toRow} of {total}
          </>
        )}
      </p>

      {!loading && total === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          {hasFilters ? "No companies match your filters." : "No companies yet. Register one to get started."}
        </p>
      ) : (
        <div
          className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 ${loading ? "opacity-60" : ""}`}
        >
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr
                  key={hg.id}
                  className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
                >
                  {hg.headers.map((h) => (
                    <th key={h.id} scope="col" className="px-4 py-3">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800 odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900/40 dark:even:bg-slate-900/20"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
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
        open={confirmDelete !== null}
        title="Delete company?"
        description={`Delete ${confirmDeleteLabel}? This removes the company record and cannot be undone.`}
        confirmLabel="Delete company"
        cancelLabel="Cancel"
        variant="danger"
        pending={confirmDelete !== null && deleteBusyId === confirmDelete.companyId}
        onCancel={() => {
          if (deleteBusyId) return;
          setConfirmDelete(null);
        }}
        onConfirm={onConfirmDelete}
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
