"use client";

import {
  listDriverHireRequestsAction,
  loadDriverHireRequestDetailAction,
  respondToHireAccessRequestAction,
  type DriverHireRequestSummary,
} from "@/app/actions/rental-hire-wizard";
import { startDriverHireSigningFromRequestAction } from "@/app/actions/hire-signing";
import { HireAccessReviewModal } from "@/components/fleet/hire-access-review-modal";
import { useDriverHireAccessRealtime } from "@/hooks/use-hire-realtime";
import type { HireAccessDisplay } from "@/lib/fleet/hire-access-display";
import { hireTableStatusToneClass, type HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import { formatUkDateTime } from "@/lib/datetime/uk";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
      <p className="text-sm text-rph-fg-secondary">{label}</p>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: HireTableStatusTone }) {
  if (label === "—") return null;
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${hireTableStatusToneClass(tone)}`}
    >
      {label}
    </span>
  );
}

export function DriverHireRequestsClient() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<DriverHireRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLLIElement | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState("pending");
  const [reviewDisplay, setReviewDisplay] = useState<HireAccessDisplay | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await listDriverHireRequestsAction();
      if (!res.ok) {
        setError(res.error);
        setRows([]);
        return;
      }
      setRows(res.rows);
      setError(null);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useDriverHireAccessRealtime(reload);

  useEffect(() => {
    if (!highlightId || !rows?.length) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, rows]);

  const openReview = useCallback((row: DriverHireRequestSummary) => {
    setReviewRequestId(row.id);
    setReviewStatus(row.status);
    setReviewDisplay(null);
    setReviewError(null);
    setReviewOpen(true);
    setReviewLoading(true);
    void loadDriverHireRequestDetailAction(row.id).then((res) => {
      setReviewLoading(false);
      if (!res.ok) {
        setReviewError(res.error);
        return;
      }
      setReviewStatus(res.status);
      setReviewDisplay(res.display);
    });
  }, []);

  const closeReview = useCallback(() => {
    if (pending || reviewLoading) return;
    setReviewOpen(false);
    setReviewRequestId(null);
    setReviewDisplay(null);
    setReviewError(null);
  }, [pending, reviewLoading]);

  function respond(id: string, approve: boolean, fromModal = false) {
    setError(null);
    startTransition(async () => {
      const res = await respondToHireAccessRequestAction(id, approve);
      if (!res.ok) {
        setError(res.error);
        if (fromModal) setReviewError(res.error);
        return;
      }
      if (fromModal) {
        setReviewOpen(false);
        setReviewRequestId(null);
        setReviewDisplay(null);
        setReviewError(null);
      }
      reload();
    });
  }

  function openSigning(row: DriverHireRequestSummary) {
    setError(null);
    setSigningRequestId(row.id);
    startTransition(async () => {
      const res = await startDriverHireSigningFromRequestAction(row.id);
      setSigningRequestId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.href = res.signingPath;
    });
  }

  const pendingCount = rows?.filter((r) => r.status === "pending").length ?? 0;
  const signingCount = rows?.filter((r) => r.canOpenSigning).length ?? 0;
  const reviewRow = rows?.find((r) => r.id === reviewRequestId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="rph-h1">Hire requests</h1>
          {pendingCount > 0 || signingCount > 0 ? (
            <p className="rph-meta mt-1 text-sm">
              {pendingCount > 0 ? `${pendingCount} pending approval${pendingCount === 1 ? "" : "s"}` : null}
              {pendingCount > 0 && signingCount > 0 ? " · " : null}
              {signingCount > 0 ? `${signingCount} ready to sign` : null}
            </p>
          ) : null}
        </div>
        <button type="button" className="rph-btn-ghost" disabled={pending || rows === null} onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="rph-muted text-sm">
        Review access requests from rental companies on the same row. Once access is approved and the contract is sent,
        return here to sign or continue signing.
      </p>

      {pending ? <LoadingPanel label="Updating hire requests…" /> : null}
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {rows === null ? (
        <LoadingPanel label="Loading hire requests…" />
      ) : !rows.length ? (
        <p className="rph-muted text-sm">No requests.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              ref={r.id === highlightId ? highlightRef : undefined}
              className={`rph-card p-4 ${r.id === highlightId ? "ring-2 ring-rph-rail/40" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-rph-fg">{r.companyName}</p>
                  <p className="rph-meta text-sm">
                    {r.vehicleVrm} · {r.vehicleMakeModel} · {formatUkDateTime(r.createdAt)}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-rph-fg-muted">Start</dt>
                      <dd className="font-medium text-rph-fg">{r.startDateLabel}</dd>
                    </div>
                    {r.rentLabel ? (
                      <div>
                        <dt className="text-rph-fg-muted">Rent</dt>
                        <dd className="font-medium text-rph-fg">{r.rentLabel}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusPill label={r.accessLabel} tone={r.accessTone} />
                  <StatusPill
                    label={r.signingLabel}
                    tone={
                      r.signingPhase === "fully_signed"
                        ? "success"
                        : r.signingPhase === "expired"
                          ? "error"
                          : r.canOpenSigning || r.signingPhase === "not_ready"
                            ? "pending"
                            : "neutral"
                    }
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {r.signingSignedCount > 0 && r.hireGroupId ? (
                  <Link
                    href={`/driver/hire-requests/${r.hireGroupId}/documents`}
                    className="rph-btn-ghost h-9 px-3 text-xs"
                  >
                    View signed document{r.signingSignedCount === 1 ? "" : "s"}
                    {r.signingAgreementCount > 1
                      ? ` (${r.signingSignedCount}/${r.signingAgreementCount})`
                      : ""}
                  </Link>
                ) : null}
                {r.canOpenSigning ? (
                  <button
                    type="button"
                    className="rph-btn-primary h-9 px-3 text-xs"
                    disabled={pending}
                    onClick={() => openSigning(r)}
                  >
                    {signingRequestId === r.id
                      ? "Opening…"
                      : r.signingPhase === "partially_signed"
                        ? "Continue signing"
                        : "Sign contract"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={r.canOpenSigning ? "rph-btn-ghost h-9 px-3 text-xs" : "rph-btn-primary h-9 px-3 text-xs"}
                  disabled={pending}
                  onClick={() => openReview(r)}
                >
                  Review
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <HireAccessReviewModal
        open={reviewOpen}
        pending={pending}
        loading={reviewLoading}
        loadError={reviewError}
        title={reviewRow ? `${reviewRow.companyName} · ${reviewRow.vehicleVrm}` : "Hire request"}
        companyName={reviewRow?.companyName ?? "Rental company"}
        status={reviewStatus}
        display={reviewDisplay}
        onClose={closeReview}
        onApprove={
          reviewRequestId && reviewStatus === "pending"
            ? () => respond(reviewRequestId, true, true)
            : undefined
        }
        onReject={
          reviewRequestId && reviewStatus === "pending"
            ? () => respond(reviewRequestId, false, true)
            : undefined
        }
      />
    </div>
  );
}
