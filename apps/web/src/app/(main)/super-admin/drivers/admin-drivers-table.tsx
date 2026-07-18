"use client";

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
  adminGenerateDriverPasswordResetLinkAction,
  adminSetDriverBlockedAction,
} from "@/app/actions/admin-driver-auth";
import { getAdminDriversPageAction } from "@/app/actions/admin-drivers-list";
import { ActionStatusOverlay, type ActionStatusOverlayState } from "@/components/action-status-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { driverIsBlocked, type AdminDriverListRow } from "@/lib/admin/driver-list-shared";
import type { DriverListStatusFilter } from "@/lib/admin/drivers-query";
import { DriverRowActionsMenu } from "./driver-row-actions-menu";
import { formatUkDateTime } from "@/lib/datetime/uk";

type DriversConfirmState =
  | { kind: "reset_password"; userId: string }
  | { kind: "set_blocked"; userId: string; blocked: boolean }
  | null;

function formatRegisteredAt(iso: string): string {
  return formatUkDateTime(iso);
}

const btn =
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50";
const btnNeutral =
  "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const btnOk =
  "border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100/90 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/55";

const thBtn =
  "inline-flex items-center gap-0.5 font-semibold text-slate-900 hover:text-slate-600 dark:text-slate-100 dark:hover:text-slate-300";

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

const STATUS_LABELS: Record<DriverListStatusFilter, string> = {
  all: "All",
  active: "Active",
  blocked: "Blocked",
};

const toolbarFieldLabel =
  "mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200";

function SortGlyph({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <span aria-hidden>↑</span>;
  if (state === "desc") return <span aria-hidden>↓</span>;
  return null;
}

export function AdminDriversTable() {
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerOk, setBannerOk] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<DriversConfirmState>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [actionOverlay, setActionOverlay] = useState<ActionStatusOverlayState | null>(null);

  const [rows, setRows] = useState<AdminDriverListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DriverListStatusFilter>("all");

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
    const res = await getAdminDriversPageAction({
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
  }, [load]);

  const refetch = useCallback(() => {
    void load();
  }, [load]);

  const onResetPassword = useCallback((userId: string) => {
    setBannerError(null);
    setBannerOk(null);
    setConfirmDialog({ kind: "reset_password", userId });
  }, []);

  const onSetBlocked = useCallback((userId: string, blocked: boolean) => {
    setBannerError(null);
    setBannerOk(null);
    setConfirmDialog({ kind: "set_blocked", userId, blocked });
  }, []);

  const handleConfirmDialog = useCallback(async () => {
    const ctx = confirmDialog;
    if (!ctx || confirmPending) return;

    setBannerError(null);
    setBannerOk(null);
    setConfirmPending(true);

    if (ctx.kind === "reset_password") {
      setPendingKey(`${ctx.userId}-reset`);
      setActionOverlay({
        phase: "pending",
        title: "Generating reset link…",
        detail: "Creating a one-time password reset link. Please wait.",
      });
      const res = await adminGenerateDriverPasswordResetLinkAction(ctx.userId);
      setPendingKey(null);
      setConfirmPending(false);
      setConfirmDialog(null);
      if (res.error) {
        setActionOverlay({
          phase: "error",
          title: "Password reset failed",
          detail: res.error,
        });
        return;
      }
      if (res.passwordResetLink) {
        setActionOverlay(null);
        setResetLink(res.passwordResetLink);
        setBannerOk("Reset link generated. Copy it from the dialog below.");
      }
      return;
    }

    setPendingKey(`${ctx.userId}-${ctx.blocked ? "block" : "active"}`);
    setActionOverlay({
      phase: "pending",
      title: ctx.blocked ? "Blocking driver…" : "Activating driver…",
      detail: "Updating account access. Please wait.",
    });
    const res = await adminSetDriverBlockedAction(ctx.userId, ctx.blocked);
    setPendingKey(null);
    setConfirmPending(false);
    setConfirmDialog(null);
    if (res.error) {
      setActionOverlay({
        phase: "error",
        title: "Update failed",
        detail: res.error,
      });
      return;
    }
    setActionOverlay({
      phase: "success",
      title: ctx.blocked ? "Driver blocked" : "Driver set active",
      detail: ctx.blocked
        ? "They will not be able to sign in until you set them active again."
        : "They can sign in again with their existing password.",
    });
    window.setTimeout(() => setActionOverlay(null), 2000);
    refetch();
  }, [confirmDialog, confirmPending, refetch]);

  async function copyResetLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      setBannerOk("Link copied to clipboard.");
    } catch {
      setBannerError("Could not copy automatically — select the link and copy manually.");
    }
  }

  const columns = useMemo<ColumnDef<AdminDriverListRow>[]>(
    () => [
      {
        id: "first_name",
        accessorFn: (r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
        header: ({ column }) => (
          <button
            type="button"
            className={thBtn}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => (
          <span className="font-medium text-slate-900 dark:text-slate-100">{String(info.getValue())}</span>
        ),
      },
      {
        id: "account_email",
        accessorKey: "email",
        header: ({ column }) => (
          <button
            type="button"
            className={thBtn}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
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
        header: ({ column }) => (
          <button
            type="button"
            className={thBtn}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Phone
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
      },
      {
        id: "address_town",
        accessorKey: "town",
        header: ({ column }) => (
          <button
            type="button"
            className={thBtn}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Town
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
      },
      {
        id: "address_postcode",
        accessorKey: "postcode",
        header: ({ column }) => (
          <button
            type="button"
            className={thBtn}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Postcode
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => <span className="whitespace-nowrap">{String(info.getValue() || "—")}</span>,
      },
      {
        id: "_status",
        header: "Status",
        enableSorting: false,
        cell: (info) => {
          const d = info.row.original;
          const blocked = driverIsBlocked(d);
          return blocked ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
              Blocked
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-100">
              Active
            </span>
          );
        },
      },
      {
        id: "created_at",
        accessorKey: "registeredAt",
        header: ({ column }) => (
          <button
            type="button"
            className={thBtn}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Registered
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
        id: "_actions",
        header: "Actions",
        enableSorting: false,
        cell: (info) => {
          const d = info.row.original;
          return (
            <DriverRowActionsMenu
              driver={d}
              blocked={driverIsBlocked(d)}
              pendingKey={pendingKey}
              onResetPassword={onResetPassword}
              onSetBlocked={onSetBlocked}
            />
          );
        },
      },
    ],
    [onResetPassword, onSetBlocked, pendingKey],
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

  const confirmTitles =
    confirmDialog?.kind === "reset_password"
      ? {
          title: "Generate password reset link?",
          description:
            "We will create a one-time link for this driver. Copy it and send it securely — it expires quickly.",
          confirmLabel: "Generate link",
          variant: "default" as const,
        }
      : confirmDialog?.blocked
        ? {
            title: "Block this driver?",
            description: "They will not be able to sign in until you choose Set active from the row menu.",
            confirmLabel: "Block account",
            variant: "danger" as const,
          }
        : confirmDialog
          ? {
              title: "Set driver active?",
              description: "Allow this driver to sign in again with their existing password.",
              confirmLabel: "Set active",
              variant: "default" as const,
            }
          : { title: "", description: "", confirmLabel: "Confirm", variant: "default" as const };

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmTitles.title}
        description={confirmTitles.description}
        confirmLabel={confirmTitles.confirmLabel}
        cancelLabel="Cancel"
        variant={confirmTitles.variant}
        pending={confirmPending}
        onCancel={() => {
          if (confirmPending) return;
          setConfirmDialog(null);
        }}
        onConfirm={handleConfirmDialog}
      />
      <ActionStatusOverlay state={actionOverlay} onDismiss={() => setActionOverlay(null)} />

      {loadError ? <p className="rph-alert-error">{loadError}</p> : null}
      {bannerError ? <p className="rph-alert-error">{bannerError}</p> : null}
      {bannerOk ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-100">
          {bannerOk}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4 sm:gap-y-3">
        <label className="min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-xl">
          <span className={toolbarFieldLabel}>Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, email, phone, town, postcode…"
            className="rph-input-auth shadow-sm"
          />
        </label>

        <div className="shrink-0 sm:w-[11rem]">
          <span className={toolbarFieldLabel}>Status</span>
          <Select.Root value={statusFilter} onValueChange={(v) => setStatusFilter(v as DriverListStatusFilter)}>
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
                  {(["all", "active", "blocked"] as const).map((value) => (
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
          {debouncedSearch || statusFilter !== "all"
            ? "No drivers match your filters."
            : "No driver profiles found yet."}
        </p>
      ) : (
        <div
          className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 ${loading ? "opacity-60" : ""}`}
        >
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
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

      {resetLink ? (
        <div
          className="fixed inset-0 z-[280] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px] sm:p-6"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setResetLink(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-link-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="reset-link-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Password reset link
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Send this link to the driver through a secure channel. Do not post it in chat or email without
              encryption if possible.
            </p>
            <textarea
              readOnly
              value={resetLink}
              rows={3}
              className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={`${btn} ${btnOk} min-h-9 px-3`} onClick={() => void copyResetLink()}>
                Copy link
              </button>
              <button
                type="button"
                className={`${btn} ${btnNeutral} min-h-9 px-3`}
                onClick={() => setResetLink(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Use the <span className="font-medium text-slate-600 dark:text-slate-300">⋮</span> button on each row for the
        menu (keyboard-friendly). <span className="font-medium text-slate-600 dark:text-slate-300">Reset password</span>{" "}
        creates a one-time link (same as email recovery) for you to copy and share.{" "}
        <span className="font-medium text-slate-600 dark:text-slate-300">Block</span> uses Supabase Auth ban — the user
        cannot sign in until <span className="font-medium text-slate-600 dark:text-slate-300">Set active</span>. Requires{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">/auth/callback</code> in redirect URLs.
      </p>
    </div>
  );
}
