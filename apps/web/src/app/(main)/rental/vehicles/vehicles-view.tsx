"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadDraft } from "@/lib/forms/form-draft";
import { VEHICLE_DOC_TYPE_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_STATUSES, type VehicleRow } from "@/lib/fleet/vehicles";
import {
  vehicleExpiryAttentionItems,
  vehicleExpiryTextClass,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import { vehicleWorkspaceHref } from "@/lib/fleet/vehicle-workspace-nav";
import { formatUkDate } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";
import type { FleetVehiclePnlSummary } from "@/app/actions/rental-vehicle-financials";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { VehicleExpiryPills } from "./vehicle-expiry-indicators";
import { ADD_VEHICLE_DRAFT_KEY, AddVehicleModal } from "./add-vehicle-modal";

const btnPrimary = "rph-btn-primary";
const btnGhost = "rph-btn-ghost";

type SubOpt = { id: string; name: string | null; is_primary: boolean };

export function VehiclesView({
  vehicles,
  subcompanies,
  notifySettings,
  canManage,
  canDelete: _canDelete,
  pnlByVehicle,
}: {
  vehicles: VehicleRow[];
  subcompanies: SubOpt[];
  notifySettings: CompanyNotificationSettings;
  canManage: boolean;
  canDelete: boolean;
  pnlByVehicle?: Map<string, FleetVehiclePnlSummary>;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draftHint, setDraftHint] = useState<{ vrm: string; make: string; model: string; updatedAt: string } | null>(
    null,
  );

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
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.vrm.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.subcompany_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [vehicles, filter, statusFilter]);

  const fleetAttentionCount = useMemo(
    () => vehicles.filter((v) => vehicleExpiryAttentionItems(v, notifySettings).length > 0).length,
    [vehicles, notifySettings],
  );

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
        {canManage && subcompanies.length > 0 ? (
          <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}>
            Add vehicle
          </button>
        ) : null}
      </div>

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="rph-input sm:max-w-xs"
          placeholder="Search VRM, make, model…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="rph-input sm:max-w-[12rem]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {VEHICLE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {VEHICLE_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </div>

      {!vehicles.length ? (
        <p className="rph-muted text-sm">No vehicles yet.{canManage ? " Add your first fleet vehicle to get started." : ""}</p>
      ) : !filtered.length ? (
        <p className="rph-muted text-sm">No vehicles match your filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rph-border">
          <table className="min-w-full divide-y divide-rph-border text-sm">
            <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">VRM</th>
                <th className="px-4 py-3 font-semibold">Vehicle</th>
                <th className="px-4 py-3 font-semibold">Subcompany</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Purchase</th>
                <th className="px-4 py-3 font-semibold">Sale</th>
                <th className="px-4 py-3 font-semibold">P&amp;L</th>
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
                const pnl = pnlByVehicle?.get(v.id);
                const pnlDisplay =
                  pnl?.netPnlGbp != null
                    ? formatGbp(pnl.netPnlGbp)
                    : pnl?.bookPositionGbp != null
                      ? formatGbp(pnl.bookPositionGbp)
                      : "—";
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
                    <td className="px-4 py-3 font-mono font-semibold text-rph-fg">
                      <Link href={workspaceHref} className="hover:underline">
                        {v.vrm}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-rph-fg-secondary">
                      {v.make} {v.model}
                      {v.colour ? <span className="text-rph-fg-muted"> · {v.colour}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-rph-fg-muted">{v.subcompany_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-rph-chrome px-2 py-0.5 text-xs font-medium text-rph-fg-secondary">
                        {VEHICLE_STATUS_LABELS[v.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-rph-fg-secondary">
                      {pnl?.purchaseGbp != null ? formatGbp(pnl.purchaseGbp) : "—"}
                    </td>
                    <td className="px-4 py-3 text-rph-fg-secondary">
                      {pnl?.saleGbp != null ? formatGbp(pnl.saleGbp) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-rph-fg-secondary">{pnlDisplay}</td>
                    <td className="px-4 py-3">
                      {missing.length ? (
                        <Link href={`${detailsHref}#documents`} className="flex flex-wrap gap-1" title="Add missing documents">
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
                    </td>
                    <td className="px-4 py-3">
                      {attention.length ? (
                        <div className="space-y-1">
                          <VehicleExpiryPills items={attention} />
                          <p className={`text-xs ${vehicleExpiryTextClass(motItem?.tone ?? "ok")}`}>
                            MOT {formatUkDate(v.mot_expiry)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-rph-fg-muted">MOT {formatUkDate(v.mot_expiry)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={workspaceHref} className={btnGhost}>
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
          subcompanies={subcompanies}
          onCreated={() => {
            setDraftHint(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
