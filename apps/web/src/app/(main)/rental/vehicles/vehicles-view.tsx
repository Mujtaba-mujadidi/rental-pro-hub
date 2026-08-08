"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadDraft } from "@/lib/forms/form-draft";
import { VEHICLE_DOC_TYPE_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_STATUSES, vehicleStatusPillClass, type VehicleRow } from "@/lib/fleet/vehicles";
import {
  vehicleExpiryAttentionItems,
  vehicleExpiryTextClass,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import { vehicleWorkspaceHref } from "@/lib/fleet/vehicle-workspace-nav";
import { formatUkDate } from "@/lib/datetime/uk";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { RphSelect } from "@/components/forms/rph-select";
import { VehicleExpiryPills } from "./vehicle-expiry-indicators";
import { ADD_VEHICLE_DRAFT_KEY, AddVehicleModal, type AddVehicleCreatedResult } from "./add-vehicle-modal";

const btnPrimary = "rph-btn-primary";
const btnGhost = "rph-btn-ghost";

type SubOpt = { id: string; name: string | null; is_primary: boolean };

export function VehiclesView({
  vehicles,
  subcompanies,
  notifySettings,
  canManage,
  canDelete: _canDelete,
  initialSubcompanyId = null,
  /** When set (e.g. subcompany workspace), filter is locked and chrome stays in-workspace. */
  lockedSubcompanyId = null,
}: {
  vehicles: VehicleRow[];
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [subcompanyFilter, setSubcompanyFilter] = useState<string>(
    lockedId ?? initialSubcompanyId ?? "all",
  );
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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (subcompanyFilter !== "all" && v.subcompany_id !== subcompanyFilter) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.vrm.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.subcompany_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [vehicles, filter, statusFilter, subcompanyFilter]);

  const subcompanyFilterName =
    subcompanyFilter === "all"
      ? null
      : subcompanies.find((s) => s.id === subcompanyFilter)?.name ?? "Subcompany";

  const fleetAttentionCount = useMemo(
    () => vehicles.filter((v) => vehicleExpiryAttentionItems(v, notifySettings).length > 0).length,
    [vehicles, notifySettings],
  );

  const openVehicleInNewTab = Boolean(lockedId);
  const vehicleLinkProps = openVehicleInNewTab
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rph-h1">Vehicles</h1>
          <p className="rph-muted mt-1 max-w-2xl text-sm">
            Manage your fleet by subcompany. Open a vehicle for dashboard, details, rentals, and more.
          </p>
          {!canManage ? (
            <p className="rph-muted mt-2 text-xs">
              You can view vehicles in your assigned subcompanies. Ask an owner, admin, or operations user to add or edit
              fleet.
            </p>
          ) : null}
        </div>
        {canManage && (lockedId ? modalSubcompanies.length > 0 : subcompanies.length > 0) ? (
          <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}>
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

      {fleetAttentionCount > 0 ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">
            {fleetAttentionCount === 1
              ? "1 vehicle has an expired or soon-to-expire date"
              : `${fleetAttentionCount} vehicles have expired or soon-to-expire dates`}
          </p>
          <p className="mt-0.5 opacity-90">
            Thresholds match Settings → Notifications (MOT, tax, PHV/Taxi). Open a vehicle to update dates on Details.
          </p>
        </div>
      ) : null}

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="rph-input sm:max-w-xs"
          placeholder="Search VRM, make, model…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="w-full min-w-0 sm:max-w-[12rem]">
          <RphSelect
            value={statusFilter}
            aria-label="Filter by status"
            options={[
              { value: "all", label: "All statuses" },
              ...VEHICLE_STATUSES.map((st) => ({ value: st, label: VEHICLE_STATUS_LABELS[st] })),
            ]}
            onValueChange={setStatusFilter}
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
        <div className="rph-table-responsive">
          <table className="min-w-full divide-y divide-rph-border text-sm">
            <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">VRM</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Subcompany</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Documents</th>
                <th className="px-4 py-3 font-semibold">Expiry</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-rph-border">
              {filtered.map((v) => {
                const missing = v.missing_docs ?? [];
                const workspaceHref = vehicleWorkspaceHref(v.id);
                const detailsHref = vehicleWorkspaceHref(v.id, "details");
                const attention = vehicleExpiryAttentionItems(v, notifySettings);
                const expiryTone = worstVehicleExpiryTone(attention);
                const motItem = attention.find((i) => i.kind === "mot");
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
                    <td data-label="VRM" className="rph-table-primary px-4 py-3 font-mono font-semibold text-rph-fg">
                      <Link href={workspaceHref} className="hover:underline" {...vehicleLinkProps}>
                        {v.vrm}
                      </Link>
                    </td>
                    <td data-label="Vehicle" className="px-4 py-3 text-rph-fg-secondary">
                      <div className="rph-table-cell-value">
                        {v.make} {v.model}
                        {v.colour ? <span className="text-rph-fg-muted"> · {v.colour}</span> : null}
                      </div>
                    </td>
                    <td data-label="Subcompany" className="px-4 py-3 text-rph-fg-muted">
                      <span className="rph-table-cell-value">{v.subcompany_name ?? "—"}</span>
                    </td>
                    <td data-label="Status" className="px-4 py-3">
                      <div className="rph-table-cell-value">
                        <span className={vehicleStatusPillClass(v.status)}>
                          {VEHICLE_STATUS_LABELS[v.status]}
                        </span>
                      </div>
                    </td>
                    <td data-label="Documents" className="px-4 py-3">
                      <div className="rph-table-cell-value">
                        {missing.length ? (
                          <Link
                            href={`${detailsHref}#documents`}
                            className="flex flex-wrap justify-end gap-1"
                            title="Add missing documents"
                            {...vehicleLinkProps}
                          >
                            {missing.map((t) => (
                              <span
                                key={t}
                                className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                              >
                                Missing {VEHICLE_DOC_TYPE_LABELS[t]}
                              </span>
                            ))}
                          </Link>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                            Complete
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Expiry" className="px-4 py-3">
                      <div className="rph-table-cell-value">
                        {attention.length ? (
                          <div className="space-y-1 text-right">
                            <VehicleExpiryPills items={attention} />
                            <p className={`text-xs ${vehicleExpiryTextClass(motItem?.tone ?? "ok")}`}>
                              MOT {formatUkDate(v.mot_expiry)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-rph-fg-muted">MOT {formatUkDate(v.mot_expiry)}</span>
                        )}
                      </div>
                    </td>
                    <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                      <Link href={workspaceHref} className={btnGhost} {...vehicleLinkProps}>
                        {canManage ? "Open" : "View"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
