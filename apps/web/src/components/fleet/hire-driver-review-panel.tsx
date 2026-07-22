"use client";

import { formatUkDate } from "@/lib/datetime/uk";
import type { HireDriverReviewPayload } from "@/app/actions/rental-hire-wizard";

function DocFileIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-rph-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-rph-fg-muted">{label}</dt>
      <dd className="text-sm font-medium text-rph-fg">{value}</dd>
    </div>
  );
}

type Props = {
  profile: HireDriverReviewPayload;
  loading?: boolean;
  error?: string | null;
  busy?: boolean;
  profileConfirmed: boolean;
  onConfirm: () => void;
};

export function HireDriverReviewPanel({
  profile,
  loading = false,
  error = null,
  busy = false,
  profileConfirmed,
  onConfirm,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading driver profile…</p>
      </div>
    );
  }

  if (error) {
    return <p className="rph-alert-error text-sm">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rph-card p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Driver details</h2>
        <dl className="mt-3 divide-y divide-rph-border/70">
          <DetailRow label="Name" value={profile.fullName} />
          {profile.email ? <DetailRow label="Email" value={profile.email} /> : null}
          <DetailRow label="Date of birth" value={formatUkDate(profile.dateOfBirth)} />
          <DetailRow label="Phone" value={profile.phone} />
          <DetailRow label="Address" value={profile.address} />
          {profile.drivingLicenceNumber ? (
            <DetailRow label="Driving licence" value={profile.drivingLicenceNumber} />
          ) : null}
          {profile.drivingLicenceExpiry ? (
            <DetailRow label="Licence expiry" value={formatUkDate(profile.drivingLicenceExpiry)} />
          ) : null}
          {profile.phvLicenceNumber ? <DetailRow label="PHV/Taxi licence" value={profile.phvLicenceNumber} /> : null}
          {profile.phvLicensingAuthority ? (
            <DetailRow label="Licensing authority" value={profile.phvLicensingAuthority} />
          ) : null}
          {profile.phvLicenceExpiry ? (
            <DetailRow label="PHV expiry" value={formatUkDate(profile.phvLicenceExpiry)} />
          ) : null}
        </dl>
      </section>

      <section className="rph-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Documents</h2>
          {profile.documents.every((d) => d.status === "on_file") ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Complete
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              {profile.documents.filter((d) => d.status === "missing").length} missing
            </span>
          )}
        </div>
        <ul className="mt-3 divide-y divide-rph-border">
          {profile.documents.map((doc) => (
            <li key={doc.id} className="flex items-start justify-between gap-3 py-3 first:pt-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DocFileIcon />
                  <p className="text-sm font-semibold text-rph-fg">{doc.label}</p>
                  {doc.status === "missing" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                      Missing
                    </span>
                  ) : null}
                </div>
                <p className="rph-meta mt-1 pl-6">{doc.status === "on_file" ? "On file" : "Not uploaded yet"}</p>
              </div>
              {doc.viewUrl ? (
                <a
                  href={doc.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rph-btn-ghost h-8 shrink-0 px-2.5 text-xs"
                >
                  View
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {profileConfirmed ? (
        <p className="rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          Driver profile confirmed. Continue to create and send contracts for signature.
        </p>
      ) : (
        <label className={`rph-card flex items-start gap-3 p-4 ${loading || error ? "opacity-60" : ""}`}>
          <input
            type="checkbox"
            className="mt-1"
            disabled={busy || loading || Boolean(error)}
            onChange={(e) => {
              if (e.target.checked) onConfirm();
            }}
          />
          <span className="text-sm text-rph-fg-secondary">
            I have reviewed this driver&apos;s profile and documents and confirm the information is correct to proceed
            with the hire contract.
          </span>
        </label>
      )}
    </div>
  );
}
