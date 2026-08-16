"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadDraft } from "@/lib/forms/form-draft";
import {
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  vehicleStatusPillClass,
  type VehicleRow,
  type VehicleStatus,
} from "@/lib/fleet/vehicles";
import {
  vehicleExpiryAttentionItems,
  vehicleExpiryTextClass,
  vehicleHasExpiryAttention,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import { vehicleWorkspaceHref } from "@/lib/fleet/vehicle-workspace-nav";
import { formatUkDateTime } from "@/lib/datetime/uk";
import type { TransferredOutVehicleSummary } from "@/lib/fleet/vehicle-historic-access";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import {
  vehicleListNextExpiryDisplay,
} from "@/lib/rental/subcompany-fleet-display";
import { RphSelect } from "@/components/forms/rph-select";
import { RphOpenLink } from "@/components/ui/rph-open-link";
import { RphTablePaginationBar } from "@/components/ui/rph-table-pagination-bar";
import { ADD_VEHICLE_DRAFT_KEY, AddVehicleModal, type AddVehicleCreatedResult } from "./add-vehicle-modal";

const btnPrimary = "rph-btn-primary";
const btnGhost = "rph-btn-ghost";

type SubOpt = { id: string; name: string | null; is_primary: boolean };

/** Screenshot-aligned label for on-hire fleet status. */
function fleetStatusLabel(status: VehicleStatus): string {
  if (status === "on_rent") return "On hire";
  return VEHICLE_STATUS_LABELS[status];
}

export function VehiclesView({
  vehicles,
  transferredOutVehicles = [],
  subcompanies,
  notifySettings,
  canManage,
  canDelete: _canDelete,
  initialSubcompanyId = null,
  /** When set (e.g. subcompany workspace), filter is locked and chrome stays in-workspace. */
  lockedSubcompanyId = null,
}: {
  vehicles: VehicleRow[];
  transferredOutVehicles?: TransferredOutVehicleSummary[];
  subcompanies: SubOpt[];
  notifySettings: CompanyNotificationSettings;
  canManage: boolean;
  canDelete: boolean;
  initialSubcompanyId?: string | null;
  lockedSubcompanyId?: string | null;
}) {
  const router = useRouter();
  const lockedId = lockedSubcompanyId?.trim() || null;
  const [filter, setFilter] = useState("");
  const [listFilter, setListFilter] = useState<string>("all");
  const [subcompanyFilter, setSubcompanyFilter] = useState<string>(
    lockedId ?? initialSubcompanyId ?? "all",
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const modalSubcompanies = lockedId
    ? subcompanies.filter((s) => s.id === lockedId)
    : subcompanies;
  const [createOpen, setCreateOpen] = useState(false);
  const [draftHint, setDraftHint] = useState<{ vrm: string; make: string; model: string; updatedAt: string } | null>(
    null,
  );
  const [docUploadNotice, setDocUploadNotice] = useState<AddVehicleCreatedResult | null>(null);

  useEffect(() => {
    function refreshDraftHint() {
      const stored = loadDraft<{
        fields?: { vrm?: string; make?: string; model?: string };
      }>(ADD_VEHICLE_DRAFT_KEY);
      if (!stored?.data) {
        setDraftHint(null);
        return;
      }
      const f = stored.data.fields ?? {};
      setDraftHint({
        vrm: f.vrm?.trim() || "",
        make: f.make?.trim() || "",
        model: f.model?.trim() || "",
        updatedAt: stored.updatedAt,
      });
    }
    refreshDraftHint();
  }, [createOpen]);

  useEffect(() => {
    setPageIndex(0);
  }, [filter, listFilter, subcompanyFilter]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (subcompanyFilter !== "all" && v.subcompany_id !== subcompanyFilter) return false;
      if (listFilter === "attention") {
        if (!vehicleHasExpiryAttention(v, notifySettings)) return false;
      } else if (listFilter !== "all" && v.status !== listFilter) {
        return false;
      }
      if (!q) return true;
      return (
        v.vrm.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.subcompany_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [vehicles, filter, listFilter, subcompanyFilter, notifySettings]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  const paginated = useMemo(
    () => filtered.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize),
    [filtered, safePageIndex, pageSize],
  );
  const fromRow = total === 0 ? 0 : safePageIndex * pageSize + 1;
  const toRow = Math.min((safePageIndex + 1) * pageSize, total);

  const paginationProps = {
    pageIndex: safePageIndex,
    pageCount,
    pageSize,
    total,
    fromRow,
    toRow,
    onPrevious: () => setPageIndex((p) => Math.max(0, p - 1)),
    onNext: () => setPageIndex((p) => Math.min(pageCount - 1, p + 1)),
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPageIndex(0);
    },
  };
  const subcompanyFilterName =
    subcompanyFilter === "all"
      ? null
      : subcompanies.find((s) => s.id === subcompanyFilter)?.name ?? "Subcompany";

  const fleetStats = useMemo(() => {
    let onHire = 0;
    let available = 0;
    let attention = 0;
    for (const v of vehicles) {
      if (v.status === "on_rent") onHire += 1;
      if (v.status === "available") available += 1;
      if (vehicleExpiryAttentionItems(v, notifySettings).length > 0) attention += 1;
    }
    return {
      total: vehicles.length,
      onHire,
      available,
      attention,
    };
  }, [vehicles, notifySettings]);

  const openVehicleInNewTab = Boolean(lockedId);
  const vehicleLinkProps = openVehicleInNewTab
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};

  const statsItems = [
    { key: "total", label: "Total fleet", value: fleetStats.total, attention: false },
    { key: "onHire", label: "On hire", value: fleetStats.onHire, attention: false },
    { key: "available", label: "Available", value: fleetStats.available, attention: false },
    { key: "attention", label: "Attention", value: fleetStats.attention, attention: true },
  ] as const;

  function toggleAttentionFilter() {
    setListFilter((current) => (current === "attention" ? "all" : "attention"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="rph-h1">Vehicles</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm">
            Manage your fleet, compliance and availability across every subcompany.
          </p>
          {!canManage ? (
            <p className="rph-muted mt-2 text-xs">
              You can view vehicles in your assigned subcompanies. Ask an owner, admin, or operations user to add or edit
              fleet.
            </p>
          ) : null}
        </div>
        {canManage && (lockedId ? modalSubcompanies.length > 0 : subcompanies.length > 0) ? (
          <button
            type="button"
            className={`${btnPrimary} w-full shrink-0 sm:w-auto`}
            onClick={() => setCreateOpen(true)}
          >
            Add vehicle
          </button>
        ) : null}
      </div>

      {docUploadNotice ? (
        <div
          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{docUploadNotice.vrm} was saved to your fleet</p>
              <p>
                We could not upload{" "}
                {docUploadNotice.failedDocUploadLabels.length === 1
                  ? docUploadNotice.failedDocUploadLabels[0]
                  : `${docUploadNotice.failedDocUploadLabels.slice(0, -1).join(", ")} and ${docUploadNotice.failedDocUploadLabels.at(-1)}`}
                . Those documents are still marked as missing — open the vehicle and upload smaller files on the Details
                tab (each file under 12 MB, or use fewer images).
              </p>
              <Link
                href={`${vehicleWorkspaceHref(docUploadNotice.vehicleId, "details")}#documents`}
                className="rph-link inline-block text-sm"
                {...vehicleLinkProps}
              >
                Upload documents for {docUploadNotice.vrm}
              </Link>
            </div>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setDocUploadNotice(null)}
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile stats — single stacked card */}
      <div className="rph-card divide-y divide-rph-border p-0 sm:hidden">
        {statsItems.map((item) => {
          const isAttentionToggle = item.key === "attention";
          const active = isAttentionToggle && listFilter === "attention";
          const rowClass = `flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
            isAttentionToggle ? "hover:bg-rph-chrome/60" : ""
          } ${active ? "bg-amber-50/80 dark:bg-amber-950/25" : ""}`;
          const content = (
            <>
              <span className="text-sm text-rph-fg-secondary">{item.label}</span>
              <span
                className={`text-base font-semibold tabular-nums ${
                  item.attention && item.value > 0 ? "text-red-700 dark:text-red-300" : "text-rph-fg"
                }`}
              >
                {item.value}
              </span>
            </>
          );
          return isAttentionToggle ? (
            <button
              key={item.key}
              type="button"
              className={rowClass}
              onClick={toggleAttentionFilter}
              aria-pressed={active}
              title={active ? "Show all vehicles" : "Show vehicles that need attention"}
            >
              {content}
            </button>
          ) : (
            <div key={item.key} className={rowClass}>
              {content}
            </div>
          );
        })}
      </div>

      {/* Desktop stats — four cards */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-4">
        {statsItems.map((item) => {
          const isAttentionToggle = item.key === "attention";
          const active = isAttentionToggle && listFilter === "attention";
          const cardClass = `rph-card px-4 py-3 text-left ${
            isAttentionToggle ? "transition-colors hover:bg-rph-chrome/40" : ""
          } ${active ? "ring-2 ring-amber-400/70 dark:ring-amber-500/50" : ""}`;
          const body = (
            <>
              <p className="text-sm text-rph-fg-secondary">{item.label}</p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  item.attention && item.value > 0 ? "text-red-700 dark:text-red-300" : "text-rph-fg"
                }`}
              >
                {item.value}
              </p>
            </>
          );
          return isAttentionToggle ? (
            <button
              key={item.key}
              type="button"
              className={cardClass}
              onClick={toggleAttentionFilter}
              aria-pressed={active}
              title={active ? "Show all vehicles" : "Show vehicles that need attention"}
            >
              {body}
            </button>
          ) : (
            <div key={item.key} className={cardClass}>
              {body}
            </div>
          );
        })}
      </div>

      {draftHint && canManage && !createOpen ? (
        <div className="rph-alert-warn flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-semibold">Unfinished vehicle draft on this device</p>
            <p className="mt-0.5 opacity-90">
              {draftHint.vrm || draftHint.make
                ? `${[draftHint.vrm, draftHint.make, draftHint.model].filter(Boolean).join(" · ")} — `
                : null}
              Drafts are only stored in this browser. They do not appear in the list until you finish and click{" "}
              <span className="font-medium">Save vehicle</span>.
            </p>
          </div>
          <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}>
            Continue draft
          </button>
        </div>
      ) : null}

      {subcompanyFilterName && !lockedId ? (
        <div className="rph-alert-ok flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>
            Showing vehicles for <span className="font-semibold">{subcompanyFilterName}</span>
          </p>
          <button
            type="button"
            className="rph-btn-ghost h-8 px-3 text-xs"
            onClick={() => {
              setSubcompanyFilter("all");
              router.replace("/rental/vehicles");
            }}
          >
            Clear filter
          </button>
        </div>
      ) : null}

      <div className="rph-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <input
          className="rph-input min-w-0 flex-1"
          placeholder="Search registration, make or model"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Search registration, make or model"
        />
        <div className="w-full min-w-0 sm:max-w-[14rem]">
          <RphSelect
            value={listFilter}
            aria-label="Filter vehicles"
            options={[
              { value: "all", label: "All vehicles" },
              { value: "attention", label: "Needs attention" },
              ...VEHICLE_STATUSES.map((st) => ({ value: st, label: fleetStatusLabel(st) })),
            ]}
            onValueChange={setListFilter}
          />
        </div>
        {!lockedId && subcompanies.length > 1 ? (
          <div className="w-full min-w-0 sm:max-w-[14rem]">
            <RphSelect
              value={subcompanyFilter}
              aria-label="Filter by subcompany"
              options={[
                { value: "all", label: "All subcompanies" },
                ...subcompanies.map((s) => ({
                  value: s.id,
                  label: `${s.name ?? "—"}${s.is_primary ? " (Main)" : ""}`,
                })),
              ]}
              onValueChange={(next) => {
                setSubcompanyFilter(next);
                router.replace(next === "all" ? "/rental/vehicles" : `/rental/vehicles?subcompanyId=${next}`);
              }}
            />
          </div>
        ) : null}
      </div>

      {!vehicles.length ? (
        <p className="rph-muted text-sm">No vehicles yet.{canManage ? " Add your first fleet vehicle to get started." : ""}</p>
      ) : !filtered.length ? (
        <p className="rph-muted text-sm">No vehicles match your filters.</p>
      ) : (
        <div className="space-y-3">
          <div className="rph-table-responsive fleet-vehicles-table">
            <table className="min-w-full divide-y divide-rph-border text-sm">
              <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Subcompany</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Documents</th>
                  <th className="px-4 py-3 font-semibold">Next expiry</th>
                  <th className="px-4 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rph-border">
                {paginated.map((v) => {
                  const missing = v.missing_docs ?? [];
                  const workspaceHref = vehicleWorkspaceHref(v.id);
                  const detailsHref = vehicleWorkspaceHref(v.id, "details");
                  const attention = vehicleExpiryAttentionItems(v, notifySettings);
                  const expiryTone = worstVehicleExpiryTone(attention);
                  const nextExpiry = vehicleListNextExpiryDisplay(v, notifySettings);
                  return (
                    <tr
                      key={v.id}
                      className={`bg-rph-raised ${
                        expiryTone === "expired"
                          ? "bg-red-50/70 dark:bg-red-950/20"
                          : expiryTone === "expiring"
                            ? "bg-amber-50/70 dark:bg-amber-950/20"
                            : ""
                      }`}
                    >
                      <td data-label="Vehicle" className="rph-table-primary px-4 py-3">
                        <Link href={workspaceHref} className="block hover:underline" {...vehicleLinkProps}>
                          <span className="font-semibold text-rph-fg">{v.vrm}</span>
                          <span className="mt-0.5 block text-xs text-rph-fg-muted">
                            {v.make} {v.model}
                          </span>
                        </Link>
                      </td>
                      <td data-label="Subcompany" className="px-4 py-3 text-rph-fg-secondary">
                        <span className="rph-table-cell-value">{v.subcompany_name ?? "—"}</span>
                      </td>
                      <td data-label="Status" className="px-4 py-3">
                        <div className="rph-table-cell-value">
                          <span className={vehicleStatusPillClass(v.status)}>{fleetStatusLabel(v.status)}</span>
                        </div>
                      </td>
                      <td data-label="Documents" className="px-4 py-3">
                        <div className="rph-table-cell-value">
                          {missing.length ? (
                            <Link
                              href={`${detailsHref}#documents`}
                              className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                              title={missing.map((t) => VEHICLE_DOC_TYPE_LABELS[t]).join(", ")}
                              {...vehicleLinkProps}
                            >
                              {missing.length === 1
                                ? `Missing ${VEHICLE_DOC_TYPE_LABELS[missing[0]!]}`
                                : `${missing.length} missing`}
                            </Link>
                          ) : (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                              Complete
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Next expiry" className="px-4 py-3">
                        <div className="rph-table-cell-value">
                          <span className={vehicleExpiryTextClass(nextExpiry.tone)}>{nextExpiry.label}</span>
                        </div>
                      </td>
                      <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                        <RphOpenLink href={workspaceHref} aria-label={`${canManage ? "Open" : "View"} ${v.vrm}`} {...vehicleLinkProps}>
                          {canManage ? "Open" : "View"}
                        </RphOpenLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <RphTablePaginationBar
            {...paginationProps}
            className="rounded-xl border border-rph-border"
          />
        </div>
      )}

      {lockedId && transferredOutVehicles.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-rph-fg">Transferred out</h2>
            <p className="rph-meta mt-0.5">
              Vehicles that left this company. Open for read-only historic hires and documents from your assignment
              period.
            </p>
          </div>
          <div className="rph-table-responsive fleet-vehicles-table">
            <table className="min-w-full divide-y divide-rph-border text-sm">
              <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Transferred to</th>
                  <th className="px-4 py-3 font-semibold">Transferred</th>
                  <th className="px-4 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rph-border">
                {transferredOutVehicles.map((row) => {
                  const workspaceHref = vehicleWorkspaceHref(row.vehicleId);
                  return (
                    <tr key={row.vehicleId} className="bg-rph-raised">
                      <td data-label="Vehicle" className="rph-table-primary px-4 py-3">
                        <Link href={workspaceHref} className="block hover:underline" {...vehicleLinkProps}>
                          <span className="font-semibold text-rph-fg">{row.vrm}</span>
                          <span className="mt-0.5 block text-xs text-rph-fg-muted">
                            {row.make} {row.model}
                          </span>
                        </Link>
                      </td>
                      <td data-label="Transferred to" className="px-4 py-3 text-rph-fg-secondary">
                        <span className="rph-table-cell-value">{row.transferredToSubcompanyName ?? "—"}</span>
                      </td>
                      <td data-label="Transferred" className="px-4 py-3 text-rph-fg-secondary">
                        <span className="rph-table-cell-value">{formatUkDateTime(row.transferredAt)}</span>
                      </td>
                      <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                        <RphOpenLink href={workspaceHref} aria-label={`Historic view ${row.vrm}`} {...vehicleLinkProps}>
                          Historic view
                        </RphOpenLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <AddVehicleModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          subcompanies={modalSubcompanies.length ? modalSubcompanies : subcompanies}
          onCreated={(result) => {
            setDraftHint(null);
            if (result.failedDocUploadLabels.length) {
              setDocUploadNotice(result);
            }
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
