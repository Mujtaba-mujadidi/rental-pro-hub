"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VehiclesPageData } from "@/app/actions/rental-vehicles";
import { AddVehicleModal, ADD_VEHICLE_DRAFT_KEY, type AddVehicleCreatedResult } from "@/app/(main)/rental/vehicles/add-vehicle-modal";
import { RphSelect } from "@/components/forms/rph-select";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { loadDraft } from "@/lib/forms/form-draft";
import {
  vehicleExpiryAttentionItems,
  vehicleExpiryTextClass,
  vehicleHasExpiryAttention,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import { vehicleWorkspaceHref } from "@/lib/fleet/vehicle-workspace-nav";
import {
  VEHICLE_DOC_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUSES,
  vehicleStatusPillClass,
} from "@/lib/fleet/vehicles";
import { vehicleListNextExpiryDisplay } from "@/lib/rental/subcompany-fleet-display";
import { RphOpenLink } from "@/components/ui/rph-open-link";
import { RphTablePaginationBar } from "@/components/ui/rph-table-pagination-bar";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

function fleetStatusLabel(status: keyof typeof VEHICLE_STATUS_LABELS): string {
  if (status === "on_rent") return "On hire";
  return VEHICLE_STATUS_LABELS[status];
}

export function SubcompanyVehiclesClient({
  pageData,
  subcompanyId,
}: {
  pageData: VehiclesPageData;
  subcompanyId: string;
}) {
  const router = useRouter();
  const { shell } = useSubcompanyWorkspace();
  const { vehicles, transferredOutVehicles, subcompanies, notifySettings, canManage } = pageData;
  const lockedSubs = subcompanies.filter((s) => s.id === subcompanyId);

  const [filter, setFilter] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [docUploadNotice, setDocUploadNotice] = useState<AddVehicleCreatedResult | null>(null);
  const [draftHint, setDraftHint] = useState<{
    vrm: string;
    make: string;
    model: string;
  } | null>(null);

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
      });
    }
    refreshDraftHint();
  }, [createOpen]);

  useEffect(() => {
    setPageIndex(0);
  }, [filter, listFilter]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (listFilter === "attention") {
        if (!vehicleHasExpiryAttention(v, notifySettings)) return false;
      } else if (listFilter !== "all" && v.status !== listFilter) {
        return false;
      }
      if (!q) return true;
      return (
        v.vrm.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
      );
    });
  }, [vehicles, filter, listFilter, notifySettings]);

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

  const attentionCount = useMemo(
    () => vehicles.filter((v) => vehicleExpiryAttentionItems(v, notifySettings).length > 0).length,
    [vehicles, notifySettings],
  );

  const countLabel =
    vehicles.length === 1 ? "1 vehicle" : `${vehicles.length.toLocaleString("en-GB")} vehicles`;

  return (
    <div className="subco-fleet space-y-4">
      {docUploadNotice ? (
        <div
          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{docUploadNotice.vrm} was saved to this fleet</p>
              <p>
                Some documents could not be uploaded. Open the vehicle Details tab to finish them.
              </p>
              <Link
                href={`${vehicleWorkspaceHref(docUploadNotice.vehicleId, "details")}#documents`}
                className="rph-link inline-block text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Upload documents for {docUploadNotice.vrm}
              </Link>
            </div>
            <button type="button" className="rph-btn-ghost" onClick={() => setDocUploadNotice(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {attentionCount > 0 ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">
            {attentionCount === 1
              ? "1 vehicle has an expired or soon-to-expire date"
              : `${attentionCount} vehicles have expired or soon-to-expire dates`}
          </p>
          <p className="mt-0.5 opacity-90">
            Thresholds match Settings → Notifications (MOT, tax, PHV/Taxi).
          </p>
        </div>
      ) : null}

      {draftHint && canManage && !createOpen ? (
        <div className="rph-alert-warn flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-semibold">Unfinished vehicle draft on this device</p>
            <p className="mt-0.5 opacity-90">
              {[draftHint.vrm, draftHint.make, draftHint.model].filter(Boolean).join(" · ") ||
                "Continue where you left off."}
            </p>
          </div>
          <button type="button" className="rph-btn-primary" onClick={() => setCreateOpen(true)}>
            Continue draft
          </button>
        </div>
      ) : null}

      <section className="rph-card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-rph-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="company-dash-section-label">Assigned fleet</p>
            <h2 className="mt-1 text-lg font-semibold text-rph-fg">{countLabel}</h2>
            {!canManage ? (
              <p className="mt-1 text-xs text-rph-fg-muted">
                You can view this fleet. Ask an owner, admin, or operations user to assign vehicles.
              </p>
            ) : null}
          </div>
          {canManage && lockedSubs.length > 0 ? (
            <button
              type="button"
              className="rph-btn-primary shrink-0"
              onClick={() => setCreateOpen(true)}
            >
              Add vehicle
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-b border-rph-border px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <input
            className="rph-input min-w-0 flex-1"
            placeholder="Search this fleet"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Search this fleet"
          />
          <div className="w-full min-w-0 sm:w-[14rem] sm:shrink-0">
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
        </div>

        {!vehicles.length ? (
          <p className="px-4 py-8 text-sm text-rph-fg-muted sm:px-5">
            No vehicles assigned yet.
            {canManage ? " Use Add vehicle to add the first one." : ""}
          </p>
        ) : !filtered.length ? (
          <p className="px-4 py-8 text-sm text-rph-fg-muted sm:px-5">No vehicles match your filters.</p>
        ) : (
          <>
            <div className="rph-table-responsive subco-fleet-table">
              <table className="min-w-full divide-y divide-rph-border text-sm">
                <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
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
                          <Link
                            href={workspaceHref}
                            className="block hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span className="font-semibold text-rph-fg">{v.vrm}</span>
                            <span className="mt-0.5 block text-xs text-rph-fg-muted">
                              {v.make} {v.model}
                            </span>
                          </Link>
                        </td>
                        <td data-label="Status" className="px-4 py-3">
                          <span className={vehicleStatusPillClass(v.status)}>
                            {fleetStatusLabel(v.status)}
                          </span>
                        </td>
                        <td data-label="Documents" className="px-4 py-3">
                          {missing.length ? (
                            <Link
                              href={`${detailsHref}#documents`}
                              className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                              title={missing.map((t) => VEHICLE_DOC_TYPE_LABELS[t]).join(", ")}
                              target="_blank"
                              rel="noopener noreferrer"
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
                        </td>
                        <td data-label="Next expiry" className="px-4 py-3">
                          <span className={vehicleExpiryTextClass(nextExpiry.tone)}>{nextExpiry.label}</span>
                        </td>
                        <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                          <RphOpenLink
                            href={workspaceHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${v.vrm}`}
                          >
                            Open
                          </RphOpenLink>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <RphTablePaginationBar {...paginationProps} />
          </>
        )}
      </section>

      {transferredOutVehicles.length ? (
        <section className="rph-card overflow-hidden p-0">
          <div className="border-b border-rph-border px-4 py-4 sm:px-5">
            <p className="company-dash-section-label">Transferred out</p>
            <h2 className="mt-1 text-base font-semibold text-rph-fg">Historic fleet</h2>
            <p className="mt-1 text-sm text-rph-fg-muted">
              Vehicles that left {shell.subcompany.name}. Open for read-only historic access.
            </p>
          </div>
          <div className="rph-table-responsive subco-fleet-table">
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
                  const href = vehicleWorkspaceHref(row.vehicleId);
                  return (
                    <tr key={row.vehicleId} className="bg-rph-raised">
                      <td data-label="Vehicle" className="rph-table-primary px-4 py-3">
                        <Link
                          href={href}
                          className="block hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="font-mono font-semibold text-rph-fg">{row.vrm}</span>
                          <span className="mt-0.5 block text-xs text-rph-fg-muted">
                            {row.make} {row.model}
                          </span>
                        </Link>
                      </td>
                      <td data-label="Transferred to" className="px-4 py-3 text-rph-fg-secondary">
                        {row.transferredToSubcompanyName ?? "—"}
                      </td>
                      <td data-label="Transferred" className="px-4 py-3 text-rph-fg-secondary">
                        {formatUkDateTime(row.transferredAt)}
                      </td>
                      <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                        <RphOpenLink href={href} target="_blank" rel="noopener noreferrer" aria-label={`Historic view ${row.vrm}`}>
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
          subcompanies={lockedSubs.length ? lockedSubs : subcompanies}
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
