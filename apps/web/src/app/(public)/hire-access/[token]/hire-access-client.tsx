"use client";

import {
  loadHireAccessPageStateAction,
  respondToHireAccessByTokenAction,
  verifyHireAccessOtpAction,
  type HireAccessPageState,
} from "@/app/actions/rental-hire-wizard";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { parseHireAccessSnapshot } from "@/lib/fleet/hire-access-display";
import { hireAccessApproveConfirmCopy, hireAccessRejectConfirmCopy } from "@/lib/fleet/hire-audit";
import { formatUkDateTime } from "@/lib/datetime/uk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { HireAccessDetail } from "@/components/fleet/hire-access-detail";

type UnlockedState = Extract<HireAccessPageState, { ok: true; gate: "unlocked" | "completed" }>;

type Props = {
  token: string;
  approveIntent?: boolean;
  rejectIntent?: boolean;
  initial: UnlockedState | Extract<HireAccessPageState, { ok: true; gate: "otp_required" }>;
};

function LoadingOverlay({ label }: { label: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-rph-page/85 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
      <p className="text-sm font-medium text-rph-fg-secondary">{label}</p>
    </div>
  );
}

export function HireAccessClient({ token, approveIntent, rejectIntent, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pageState, setPageState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);

  const gate = pageState.gate;
  const unlocked = gate === "unlocked" || gate === "completed";
  const done = gate === "completed" || (pageState.status !== "pending" && unlocked);

  const display = useMemo(() => {
    if (!unlocked || !("hireSummary" in pageState)) return null;
    return parseHireAccessSnapshot(pageState.hireSummary, pageState.companyName, pageState.termsPreview);
  }, [pageState, unlocked]);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await loadHireAccessPageStateAction(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPageState(res);
      setError(null);
    });
  }, [token]);

  useEffect(() => {
    if (gate !== "otp_required" || done || pending) return;
    if (rejectIntent) setRejectConfirmOpen(true);
  }, [gate, done, pending, rejectIntent]);

  const respond = useCallback(
    (approve: boolean) => {
      setError(null);
      startTransition(async () => {
        const res = await respondToHireAccessByTokenAction(token, approve);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        await refresh();
      });
    },
    [refresh, token],
  );

  const verifyOtp = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await verifyHireAccessOtpAction(token, otp);
      if (!res.ok) {
        setError(res.error);
        const state = await loadHireAccessPageStateAction(token);
        if (!state.ok && state.gate === "expired") {
          router.refresh();
          return;
        }
        if (state.ok && state.gate === "otp_required") {
          setPageState(state);
        }
        return;
      }
      setOtp("");
      await refresh();
    });
  }, [otp, refresh, router, token]);

  const loginHref = `/login?next=${encodeURIComponent(`/hire-access/${token}${approveIntent ? "?intent=approve" : ""}`)}`;
  const expiresLabel =
    pageState.expiresAt && gate === "otp_required"
      ? `Enter the code before ${formatUkDateTime(pageState.expiresAt)}.`
      : null;

  if (gate === "otp_required") {
    return (
      <div className="relative mx-auto max-w-md space-y-6">
        {pending ? <LoadingOverlay label="Verifying access code…" /> : null}
        <div className="space-y-2 text-center">
          <h1 className="rph-h1">Enter access code</h1>
          <p className="rph-muted text-sm">
            <strong className="text-rph-fg">{pageState.companyName}</strong> sent you a hire access request.
            Enter the 6-digit code from your email to review it.
          </p>
          {expiresLabel ? <p className="text-sm text-amber-800 dark:text-amber-200">{expiresLabel}</p> : null}
          {pageState.otpAttemptsRemaining < 3 ? (
            <p className="text-sm text-rph-fg-secondary">
              {pageState.otpAttemptsRemaining === 0
                ? "No attempts remaining on this link."
                : `${pageState.otpAttemptsRemaining} attempt${pageState.otpAttemptsRemaining === 1 ? "" : "s"} remaining before this link is locked.`}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-rph-fg" htmlFor="hire-access-otp">
            Access code
          </label>
          <input
            id="hire-access-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="rph-input text-center text-lg tracking-[0.35em]"
            placeholder="000000"
          />
          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
          <button
            type="button"
            className="rph-btn-primary w-full"
            disabled={pending || otp.length !== 6}
            onClick={verifyOtp}
          >
            {pending ? "Checking…" : "Continue"}
          </button>
        </div>

        <div className="rounded-xl border border-rph-border bg-rph-chrome/40 px-4 py-3 text-sm text-rph-fg-secondary">
          <p>Prefer to use your driver account?</p>
          <p className="mt-2">
            <Link href={loginHref} className="font-medium text-rph-link underline hover:text-rph-link-hover">
              Sign in to approve or reject
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!display) {
    return <LoadingOverlay label="Loading hire request…" />;
  }

  const showApproveIntentBanner = Boolean(approveIntent && pageState.signedInDriverMatch && !done);
  const showRejectIntentBanner = Boolean(rejectIntent && !done);

  return (
    <div className="relative space-y-6">
      {pending ? <LoadingOverlay label="Processing your response…" /> : null}

      <div className="space-y-2">
        <h1 className="rph-h1">Hire access request</h1>
        <p className="rph-muted text-sm">
          <strong className="text-rph-fg">{display.companyName}</strong> wants access to your driver profile to
          create a vehicle hire agreement. Review the full details below before you respond.
        </p>
        {pageState.signedInEmail ? (
          <p className="text-sm text-rph-fg-secondary">
            Signed in as <strong className="text-rph-fg">{pageState.signedInEmail}</strong>.{" "}
            {pageState.signedInDriverMatch ? (
              <Link href="/driver/hire-requests" className="text-rph-link underline hover:text-rph-link-hover">
                View all hire requests
              </Link>
            ) : (
              <span className="text-rph-fg-muted">
                This request was sent to a different driver account. You can still respond here using the email access
                code.
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-rph-fg-secondary">
            You verified this request with your email access code.{" "}
            <Link href={loginHref} className="text-rph-link underline hover:text-rph-link-hover">
              Sign in with your driver account
            </Link>{" "}
            instead if you prefer.
          </p>
        )}
      </div>

      <HireAccessDetail display={display} />

      {showApproveIntentBanner ? (
        <p className="rounded-xl border border-sky-300/80 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
          You signed in to approve this request. Review the details above, then confirm when you are ready.
        </p>
      ) : null}

      {showRejectIntentBanner ? (
        <p className="rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Review the hire details above, then confirm if you want to reject this request.
        </p>
      ) : null}

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {done ? (
        <div className="rounded-xl border border-emerald-300/80 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          Thank you — your response has been recorded.
          {pageState.signedInDriverMatch ? (
            <p className="mt-2">
              <Link href="/driver/hire-requests" className="font-semibold text-rph-link underline">
                Open hire requests
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="sticky bottom-0 -mx-6 border-t border-rph-border bg-rph-raised/95 px-6 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rph-btn-primary inline-flex min-w-[9rem] items-center justify-center gap-2"
              disabled={pending}
              onClick={() => {
                setError(null);
                setApproveConfirmOpen(true);
              }}
            >
              {pending ? "Processing…" : approveIntent ? "Confirm approval" : "Approve"}
            </button>
            <button
              type="button"
              className="rph-btn-ghost min-w-[9rem]"
              disabled={pending}
              onClick={() => {
                setError(null);
                setRejectConfirmOpen(true);
              }}
            >
              {pending ? "Processing…" : "Reject"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={approveConfirmOpen}
        title="Approve profile access?"
        description={hireAccessApproveConfirmCopy(display.companyName)}
        confirmLabel="Yes, approve access"
        cancelLabel="Go back"
        pending={pending}
        onCancel={() => setApproveConfirmOpen(false)}
        onConfirm={() => {
          setApproveConfirmOpen(false);
          respond(true);
        }}
      />

      <ConfirmDialog
        open={rejectConfirmOpen}
        title="Reject hire request?"
        description={hireAccessRejectConfirmCopy(display.companyName)}
        confirmLabel="Reject request"
        cancelLabel="Go back"
        variant="danger"
        pending={pending}
        onCancel={() => setRejectConfirmOpen(false)}
        onConfirm={() => {
          setRejectConfirmOpen(false);
          respond(false);
        }}
      />
    </div>
  );
}
