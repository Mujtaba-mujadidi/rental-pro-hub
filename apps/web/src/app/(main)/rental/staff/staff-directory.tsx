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
import { useEffect, useMemo, useState } from "react";
import type { CompanyMembershipRole } from "@/lib/auth/profile";
import { formatUkDate } from "@/lib/datetime/uk";
import { StaffManageMemberModal, type StaffMember } from "./staff-manage-member-modal";

export type { StaffMember };

const btn =
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50";
const btnNeutral =
  "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
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

const rowActionTriggerClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 data-[state=open]:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:data-[state=open]:bg-slate-800";

const rowActionContentClass =
  "z-[200] min-w-[12.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900";

const rowActionItemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-slate-800 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800";

type StaffRoleFilter = "all" | CompanyMembershipRole;
type StaffAccessFilter = "all" | "all_subcompanies" | "selected_subcompanies";
type StaffStatusFilter = "all" | StaffMember["status"];

const ROLE_FILTER_OPTIONS: { value: StaffRoleFilter; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "viewer", label: "Viewer" },
];

const ACCESS_FILTER_OPTIONS: { value: StaffAccessFilter; label: string }[] = [
  { value: "all", label: "All access types" },
  { value: "all_subcompanies", label: "All subcompanies" },
  { value: "selected_subcompanies", label: "Selected subcompanies only" },
];

const STATUS_FILTER_OPTIONS: { value: StaffStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
];

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconKebabVertical({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function SortGlyph({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <span aria-hidden>↑</span>;
  if (state === "desc") return <span aria-hidden>↓</span>;
  return null;
}

type Sub = { id: string; name: string; is_primary: boolean };

function memberSortLabel(m: StaffMember): string {
  return (m.display_name?.trim() || "user").toLowerCase() + m.user_id;
}

function matchesAccessFilter(m: StaffMember, savedIds: string[], filter: StaffAccessFilter): boolean {
  if (filter === "all") return true;
  const isFullAccess = m.role === "owner" || m.role === "admin" || m.subcompany_scope === "all";
  const isSelectedOnly =
    m.role !== "owner" &&
    m.role !== "admin" &&
    (m.subcompany_scope === "explicit" || (savedIds?.length ?? 0) > 0);
  if (filter === "all_subcompanies") return isFullAccess;
  if (filter === "selected_subcompanies") return isSelectedOnly;
  return true;
}

function accessSummaryText(m: StaffMember, savedIds: string[], subs: Sub[]): string {
  if (m.role === "owner" || m.role === "admin") return "All subcompanies";
  if (m.subcompany_scope === "all") return "All subcompanies";
  const unique = [...new Set(savedIds)];
  if (unique.length === 0) return "None set";
  const byId = new Map(subs.map((s) => [s.id, s]));
  if (unique.length <= 2) {
    return unique.map((id) => byId.get(id)?.name ?? `${id.slice(0, 8)}…`).join(", ");
  }
  return unique.length === 1 ? "1 subcompany" : `${unique.length} subcompanies`;
}

function statusBadge(status: StaffMember["status"]) {
  const base = "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize";
  if (status === "active") {
    return <span className={`${base} border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100`}>{status}</span>;
  }
  if (status === "invited") {
    return <span className={`${base} border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/45 dark:bg-amber-950/30 dark:text-amber-100`}>{status}</span>;
  }
  return <span className={`${base} border border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200`}>{status}</span>;
}

function formatAdded(iso: string): string {
  return formatUkDate(iso);
}

export function StaffDirectory({
  members,
  subcompanies,
  explicitSubsByMembership,
  canManage,
  currentUserId,
  ownerCount,
}: {
  members: StaffMember[];
  subcompanies: Sub[];
  explicitSubsByMembership: Record<string, string[]>;
  canManage: boolean;
  currentUserId: string;
  ownerCount: number;
}) {
  const [manageMember, setManageMember] = useState<StaffMember | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([{ id: "member", desc: false }]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<StaffRoleFilter>("all");
  const [accessFilter, setAccessFilter] = useState<StaffAccessFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StaffStatusFilter>("all");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPageIndex(0);
  }, [debouncedSearch, roleFilter, accessFilter, statusFilter, pageSize]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      const saved = explicitSubsByMembership[m.id] ?? [];
      if (!matchesAccessFilter(m, saved, accessFilter)) return false;
      if (!q) return true;
      const name = (m.display_name ?? "").toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      const uid = m.user_id.toLowerCase();
      const short = uid.slice(0, 8);
      const roleStr = m.role.toLowerCase();
      const statusStr = m.status.toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        uid.includes(q) ||
        short.includes(q) ||
        roleStr.includes(q) ||
        statusStr.includes(q)
      );
    });
  }, [members, debouncedSearch, roleFilter, accessFilter, statusFilter, explicitSubsByMembership]);

  const sorted = useMemo(() => {
    const sort = sorting[0];
    const out = [...filtered];
    if (!sort) return out;
    const mult = sort.desc ? -1 : 1;
    if (sort.id === "member") {
      out.sort((a, b) => mult * memberSortLabel(a).localeCompare(memberSortLabel(b)));
    } else if (sort.id === "email") {
      out.sort((a, b) => mult * (a.email ?? "").localeCompare(b.email ?? ""));
    } else if (sort.id === "role") {
      out.sort((a, b) => mult * a.role.localeCompare(b.role));
    } else if (sort.id === "status") {
      out.sort((a, b) => mult * a.status.localeCompare(b.status));
    } else if (sort.id === "added") {
      out.sort((a, b) => mult * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    }
    return out;
  }, [filtered, sorting]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = useMemo(
    () => sorted.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [sorted, pageIndex, pageSize],
  );

  const columns = useMemo<ColumnDef<StaffMember>[]>(
    () => [
      {
        id: "member",
        accessorFn: (row) => memberSortLabel(row),
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Member
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {m.display_name?.trim() || "User"}
                {m.user_id === currentUserId ? (
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">(you)</span>
                ) : null}
              </div>
              <div className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{m.user_id.slice(0, 8)}…</div>
            </div>
          );
        },
      },
      {
        id: "email",
        accessorFn: (row) => row.email ?? "",
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Email
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-slate-800 dark:text-slate-200">{row.original.email ?? "—"}</span>
        ),
      },
      {
        id: "role",
        accessorKey: "role",
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Role
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: ({ row }) => <span className="capitalize text-slate-900 dark:text-slate-100">{row.original.role}</span>,
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
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: "access",
        header: "Access",
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <span className="text-slate-700 dark:text-slate-300">
              {accessSummaryText(m, explicitSubsByMembership[m.id] ?? [], subcompanies)}
            </span>
          );
        },
      },
      {
        id: "added",
        accessorFn: (row) => row.created_at,
        header: ({ column }) => (
          <button type="button" className={thBtn} onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Added
            <SortGlyph state={column.getIsSorted()} />
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-slate-600 dark:text-slate-400">{formatAdded(row.original.created_at)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original;
          const canRowManage = canManage && !(m.role === "owner" && m.user_id !== currentUserId);
          if (!canManage) return <span className="text-slate-400">—</span>;
          return (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={rowActionTriggerClass}
                  disabled={!canRowManage}
                  aria-label="Row actions"
                  title={canRowManage ? "Actions" : "Only that user can manage this owner account."}
                >
                  <IconKebabVertical />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="bottom"
                  align="end"
                  sideOffset={6}
                  collisionPadding={12}
                  className={rowActionContentClass}
                >
                  <DropdownMenu.Item
                    className={rowActionItemClass}
                    disabled={!canRowManage}
                    onSelect={() => setManageMember(m)}
                  >
                    Manage access
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        },
      },
    ],
    [canManage, currentUserId, explicitSubsByMembership, subcompanies],
  );

  const table = useReactTable({
    data: pageRows,
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
  const hasFilters =
    debouncedSearch.length > 0 || roleFilter !== "all" || accessFilter !== "all" || statusFilter !== "all";

  const manageMemberLive = useMemo(() => {
    if (!manageMember) return null;
    return members.find((m) => m.id === manageMember.id) ?? manageMember;
  }, [manageMember, members]);

  return (
    <div className="space-y-4">
      <StaffManageMemberModal
        open={manageMember !== null}
        onOpenChange={(o) => {
          if (!o) setManageMember(null);
        }}
        member={manageMemberLive}
        savedSubcompanyIds={manageMemberLive ? explicitSubsByMembership[manageMemberLive.id] ?? [] : []}
        subcompanies={subcompanies}
        currentUserId={currentUserId}
        ownerCount={ownerCount}
      />

      {members.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          No team members yet. Use <span className="font-semibold">Add staff</span> to invite people.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-3">
            <label className="min-w-0 flex-1 lg:min-w-[12rem] lg:max-w-xl">
              <span className="mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Search</span>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name, email, user id, role, status…"
                className="rph-input-auth shadow-sm"
              />
            </label>
            <div className="shrink-0 sm:w-[11rem]">
              <span className="mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Role</span>
              <Select.Root value={roleFilter} onValueChange={(v) => setRoleFilter(v as StaffRoleFilter)}>
                <Select.Trigger className={selectTriggerClass} aria-label="Filter by role">
                  <Select.Value>
                    {ROLE_FILTER_OPTIONS.find((o) => o.value === roleFilter)?.label ?? "All roles"}
                  </Select.Value>
                  <Select.Icon className="shrink-0 text-slate-500 dark:text-slate-400">
                    <IconChevronDown />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className={selectContentClass} position="popper" side="bottom" sideOffset={6} align="start">
                    <Select.Viewport className="px-1">
                      {ROLE_FILTER_OPTIONS.map((o) => (
                        <Select.Item key={o.value} value={o.value} className={selectItemClass}>
                          <span className={selectItemIndicatorWrap}>
                            <Select.ItemIndicator>
                              <IconCheck />
                            </Select.ItemIndicator>
                          </span>
                          <Select.ItemText>{o.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <div className="shrink-0 sm:w-[11rem]">
              <span className="mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Status</span>
              <Select.Root value={statusFilter} onValueChange={(v) => setStatusFilter(v as StaffStatusFilter)}>
                <Select.Trigger className={selectTriggerClass} aria-label="Filter by status">
                  <Select.Value>
                    {STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All statuses"}
                  </Select.Value>
                  <Select.Icon className="shrink-0 text-slate-500 dark:text-slate-400">
                    <IconChevronDown />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className={selectContentClass} position="popper" side="bottom" sideOffset={6} align="start">
                    <Select.Viewport className="px-1">
                      {STATUS_FILTER_OPTIONS.map((o) => (
                        <Select.Item key={o.value} value={o.value} className={selectItemClass}>
                          <span className={selectItemIndicatorWrap}>
                            <Select.ItemIndicator>
                              <IconCheck />
                            </Select.ItemIndicator>
                          </span>
                          <Select.ItemText>{o.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <div className="shrink-0 sm:min-w-[12rem] sm:max-w-[14rem]">
              <span className="mb-1.5 block text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-200">Access</span>
              <Select.Root value={accessFilter} onValueChange={(v) => setAccessFilter(v as StaffAccessFilter)}>
                <Select.Trigger className={selectTriggerClass} aria-label="Filter by subcompany access">
                  <Select.Value>
                    {ACCESS_FILTER_OPTIONS.find((o) => o.value === accessFilter)?.label ?? "All access types"}
                  </Select.Value>
                  <Select.Icon className="shrink-0 text-slate-500 dark:text-slate-400">
                    <IconChevronDown />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className={selectContentClass} position="popper" side="bottom" sideOffset={6} align="start">
                    <Select.Viewport className="px-1">
                      {ACCESS_FILTER_OPTIONS.map((o) => (
                        <Select.Item key={o.value} value={o.value} className={selectItemClass}>
                          <span className={selectItemIndicatorWrap}>
                            <Select.ItemIndicator>
                              <IconCheck />
                            </Select.ItemIndicator>
                          </span>
                          <Select.ItemText>{o.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">Showing {fromRow}–{toRow} of {total}</p>

          {total === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
              {hasFilters ? "No team members match your filters." : "No team members to show."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                      {hg.headers.map((h) => (
                        <th key={h.id} scope="col" className="px-4 py-3 align-top">
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
                        <td key={cell.id} className="align-middle px-4 py-3 text-slate-700 dark:text-slate-300">
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
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                Previous
              </button>
              <button
                type="button"
                className={`${btn} ${btnNeutral} min-h-9`}
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                Next
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Page {pageIndex + 1} of {pageCount}
              </span>
              <div className="ml-2 w-[7.5rem]">
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
                    <Select.Content className={selectContentClass} position="popper" side="bottom" sideOffset={6} align="start">
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
          ) : null}
        </div>
      )}
    </div>
  );
}
