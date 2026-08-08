"use client";

import {
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRentalSubcompaniesPageAction } from "@/app/actions/rental-subcompanies-list";
import { RphSelect, rphSelectRowsTriggerClass } from "@/components/forms/rph-select";
import type { RentalSubcompanyListRow } from "@/lib/rental/subcompany-list-shared";
import type { RentalSubcompanyStatusFilter } from "@/lib/rental/subcompanies-query";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { responsiveTableCellProps } from "@/lib/ui/responsive-table";

const btn =
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50";
const btnNeutral =
  "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const thBtn =
  "inline-flex items-center gap-0.5 font-semibold text-slate-900 hover:text-slate-600 dark:text-slate-100 dark:hover:text-slate-300";
const PAGE_SIZES = [10, 25, 50, 100] as const;

const STATUS_LABELS: Record<RentalSubcompanyStatusFilter, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
};

function SortGlyph({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <span aria-hidden>↑</span>;
  if (state === "desc") return <span aria-hidden>↓</span>;
  return null;
}

function formatRegisteredAt(iso: string): string {
  return formatUkDateTime(iso);
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

export function RentalSubcompaniesTable({ listVersion = 0 }: { listVersion?: number }) {
  const [rows, setRows] = useState<RentalSubcompanyListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RentalSubcompanyStatusFilter>("all");

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
    const res = await getRentalSubcompaniesPageAction({
      page: pageIndex + 1,
      pageSize,
      search: debouncedSearch,
      sortBy: sort?.id ?? "created_at",
      sortDir: sort?.desc ? "desc" : "asc",
      status: statusFilter,
    });
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error);
      setRows([]);
      setTotal(0);
      return;
    }
    setRows(res.rows);
    setTotal(res.total);
  }, [pageIndex, pageSize, debouncedSearch, sorting, statusFilter]);

  useEffect(() => {
    void load();
  }, [load, listVersion]);

  const columns = useMemo<ColumnDef<RentalSubcompanyListRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        meta: { dataLabel: "Subcompany", tablePrimary: true },
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Subcompany
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => {
          const r = info.row.original;
          return (
            <div>
              <div className="font-medium">
                <Link href={`/rental/subcompany/${r.id}`} className="rph-link">
                  {r.name || "—"}
                </Link>{" "}
                {r.isPrimary ? (
                  <span className="ml-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/35 dark:text-indigo-100">
                    Main
                  </span>
                ) : null}
              </div>
              {r.legalName ? <div className="text-xs text-slate-500 dark:text-slate-400">{r.legalName}</div> : null}
            </div>
          );
        },
      },
      { id: "company_number", accessorKey: "companyNumber", header: "Co. number", enableSorting: false, meta: { dataLabel: "Co. number" } },
      {
        id: "contact",
        header: "Primary contact",
        enableSorting: false,
        meta: { dataLabel: "Primary contact" },
        cell: (info) => {
          const r = info.row.original;
          return [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") || "—";
        },
      },
      {
        id: "primary_contact_email",
        accessorKey: "email",
        meta: { dataLabel: "Email" },
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Email
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
      },
      { id: "phone", accessorKey: "phone", header: "Phone", enableSorting: false, meta: { dataLabel: "Phone" } },
      {
        id: "registered_town",
        accessorKey: "town",
        meta: { dataLabel: "Town" },
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Town
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
      },
      {
        id: "registered_postcode",
        accessorKey: "postcode",
        meta: { dataLabel: "Postcode" },
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Postcode
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        meta: { dataLabel: "Status" },
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Status
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => statusBadge(String(info.getValue() ?? "")),
      },
      {
        id: "created_at",
        accessorKey: "createdAt",
        meta: { dataLabel: "Added" },
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Added
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: (info) => formatRegisteredAt(String(info.getValue() ?? "")),
      },
    ],
    [],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize } },
    manualPagination: true,
    manualSorting: true,
    pageCount,
    onSortingChange: (u) => {
      setSorting(u);
      setPageIndex(0);
    },
    onPaginationChange: (u) => {
      const next = typeof u === "function" ? u({ pageIndex, pageSize }) : u;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const fromRow = total === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min((pageIndex + 1) * pageSize, total);
  const hasFilters = debouncedSearch.length > 0 || statusFilter !== "all";

  return (
    <div className="space-y-3">
      {loadError ? <p className="rph-alert-error">{loadError}</p> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4 sm:gap-y-3">
        <label className="min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-xl">
          <span className="mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, email, phone, town, postcode, company no.…"
            className="rph-input-auth shadow-sm"
          />
        </label>
        <div className="shrink-0 sm:w-[11rem]">
          <span className="mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Status</span>
          <RphSelect
            value={statusFilter}
            aria-label="Filter by status"
            options={(["all", "active", "inactive", "pending"] as const).map((value) => ({
              value,
              label: STATUS_LABELS[value],
            }))}
            onValueChange={(v) => setStatusFilter(v as RentalSubcompanyStatusFilter)}
          />
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {loading ? "Loading…" : `Showing ${fromRow}–${toRow} of ${total}`}
      </p>

      {!loading && total === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          {hasFilters ? "No subcompanies match your filters." : "No subcompanies yet. Register one to get started."}
        </p>
      ) : (
        <div className={`rph-table-responsive ${loading ? "opacity-60" : ""}`}>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
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
                <tr key={row.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800 odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900/40 dark:even:bg-slate-900/20">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      {...responsiveTableCellProps(cell.column.columnDef, "px-4 py-3 text-slate-700 dark:text-slate-300")}
                    >
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
          <button type="button" className={`${btn} ${btnNeutral} min-h-9`} disabled={loading || !table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Previous
          </button>
          <button type="button" className={`${btn} ${btnNeutral} min-h-9`} disabled={loading || !table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="ml-2">
            <RphSelect
              value={String(pageSize)}
              aria-label="Rows per page"
              triggerClassName={rphSelectRowsTriggerClass}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPageIndex(0);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
