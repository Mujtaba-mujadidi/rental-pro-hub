import Link from "next/link";
import { notFound } from "next/navigation";
import { loadVehicleDetailAction } from "@/app/actions/rental-vehicles";
import { VehicleFleetTrackingCard } from "@/app/(main)/rental/vehicles/[id]/vehicle-fleet-tracking-card";
import { VehicleExpiryAlert, VehicleExpiryPills } from "@/app/(main)/rental/vehicles/vehicle-expiry-indicators";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import {
  assessVehicleExpiries,
  vehicleExpiryAttentionItems,
  vehicleExpiryTextClass,
  worstVehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import { VEHICLE_DOC_TYPE_LABELS, VEHICLE_STATUS_LABELS } from "@/lib/fleet/vehicles";

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

export default async function VehicleDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadVehicleDetailAction(id);
  if (!data.ok) notFound();

  const { vehicle, transfers, canManage, notifySettings } = data;
  const missing = vehicle.missing_docs ?? [];
  const allDates = assessVehicleExpiries(vehicle, notifySettings);
  const attention = vehicleExpiryAttentionItems(vehicle, notifySettings);
  const tone = worstVehicleExpiryTone(attention);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Dashboard</h1>
        <p className="rph-muted mt-1 text-sm">Snapshot for this vehicle. More widgets will appear as modules ship.</p>
      </div>

      <VehicleExpiryAlert items={attention} tone={tone} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Status</p>
          <p className="mt-2 text-lg font-semibold text-rph-fg">{VEHICLE_STATUS_LABELS[vehicle.status]}</p>
          <p className="rph-muted mt-1 text-sm">{vehicle.subcompany_name ?? "—"}</p>
        </div>
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Documents</p>
          {missing.length ? (
            <div className="mt-2 space-y-1">
              {missing.map((t) => (
                <p key={t} className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Missing {VEHICLE_DOC_TYPE_LABELS[t]}
                </p>
              ))}
              <Link
                href={`/rental/vehicles/${vehicle.id}/details#documents`}
                className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-xs font-semibold text-rph-fg-secondary shadow-sm transition-colors hover:bg-rph-chrome hover:text-rph-fg"
              >
                Upload on Details
                <IconArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-300">Complete</p>
          )}
        </div>
        <div
          className={`rph-card p-4 ${
            tone === "expired"
              ? "ring-2 ring-red-400/70 dark:ring-red-500/50"
              : tone === "expiring"
                ? "ring-2 ring-amber-400/70 dark:ring-amber-500/50"
                : ""
          }`}
        >
          <p className="rph-meta font-semibold uppercase tracking-wide">Key dates</p>
          {attention.length ? <VehicleExpiryPills items={attention} className="mt-2" /> : null}
          <dl className="mt-2 space-y-2 text-sm">
            {allDates.map((item) => (
              <div key={item.kind} className="flex items-baseline justify-between gap-2">
                <dt className="text-rph-fg-muted">{item.label}</dt>
                <dd className={`text-right ${vehicleExpiryTextClass(item.tone)}`}>
                  <span>{formatUkDate(item.isoDate)}</span>
                  {item.tone !== "ok" && item.daysUntil !== null ? (
                    <span className="mt-0.5 block text-xs font-semibold">{item.shortStatus}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
          {attention.length ? (
            <Link
              href={`/rental/vehicles/${vehicle.id}/details`}
              className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-xs font-semibold text-rph-fg-secondary shadow-sm transition-colors hover:bg-rph-chrome hover:text-rph-fg"
            >
              Update on Details
              <IconArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          ) : null}
        </div>
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Service</p>
          <dl className="mt-2 space-y-1 text-sm text-rph-fg-secondary">
            <div className="flex justify-between gap-2">
              <dt className="text-rph-fg-muted">Due date</dt>
              <dd>{formatUkDate(vehicle.service_due_at)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-rph-fg-muted">Current miles</dt>
              <dd>{vehicle.current_mileage != null ? vehicle.current_mileage.toLocaleString("en-GB") : "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-rph-fg-muted">Next service miles</dt>
              <dd>
                {vehicle.next_service_mileage != null ? vehicle.next_service_mileage.toLocaleString("en-GB") : "—"}
              </dd>
            </div>
          </dl>
          <Link
            href={`/rental/vehicles/${vehicle.id}/maintenance`}
            className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-rph-border bg-rph-raised px-2.5 text-xs font-semibold text-rph-fg-secondary shadow-sm transition-colors hover:bg-rph-chrome hover:text-rph-fg"
          >
            View maintenance
            <IconArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        </div>
        <div className="rph-card p-4 sm:col-span-2">
          <p className="rph-meta font-semibold uppercase tracking-wide">Recent transfers</p>
          {!transfers.length ? (
            <p className="rph-muted mt-2 text-sm">No transfers recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-rph-fg-secondary">
              {transfers.slice(0, 5).map((t) => (
                <li key={t.id}>
                  {t.from_name ?? "—"} → {t.to_name ?? "—"}{" "}
                  <span className="rph-meta">· {formatUkDateTime(t.transferred_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <VehicleFleetTrackingCard vehicleId={vehicle.id} canManage={canManage} />
      </div>
    </div>
  );
}
