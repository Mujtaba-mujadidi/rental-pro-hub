import Link from "next/link";
import { notFound } from "next/navigation";
import { loadVehicleDetailAction } from "@/app/actions/rental-vehicles";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import { VEHICLE_DOC_TYPE_LABELS, VEHICLE_STATUS_LABELS } from "@/lib/fleet/vehicles";

export default async function VehicleDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadVehicleDetailAction(id);
  if (!data.ok) notFound();

  const { vehicle, transfers } = data;
  const missing = vehicle.missing_docs ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Dashboard</h1>
        <p className="rph-muted mt-1 text-sm">Snapshot for this vehicle. More widgets will appear as modules ship.</p>
      </div>

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
              <Link href={`/rental/vehicles/${vehicle.id}/details#documents`} className="rph-link mt-2 inline-block text-sm">
                Upload on Details →
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-300">Complete</p>
          )}
        </div>
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Key dates</p>
          <dl className="mt-2 space-y-1 text-sm text-rph-fg-secondary">
            <div className="flex justify-between gap-2">
              <dt className="text-rph-fg-muted">MOT</dt>
              <dd>{formatUkDate(vehicle.mot_expiry)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-rph-fg-muted">Tax</dt>
              <dd>{formatUkDate(vehicle.tax_expiry)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-rph-fg-muted">PHV/Taxi</dt>
              <dd>{formatUkDate(vehicle.phv_licence_expiry)}</dd>
            </div>
          </dl>
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
      </div>
    </div>
  );
}
