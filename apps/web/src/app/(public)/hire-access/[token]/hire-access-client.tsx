"use client";

import { respondToHireAccessByTokenAction } from "@/app/actions/rental-hire-wizard";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { parseHireAccessSnapshot } from "@/lib/fleet/hire-access-display";
import { hireAccessApproveConfirmCopy, hireAccessRejectConfirmCopy } from "@/lib/fleet/hire-audit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { HireAccessDetail } from "@/components/fleet/hire-access-detail";

type Props = {
  token: string;
  approveIntent?: boolean;
  initial: {
    requestId: string;
    companyName: string;
    status: string;
    termsPreview: { title: string; body: string; versionLabel: string | null } | null;
    hireSummary: Record<string, unknown>;
  };
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

export function HireAccessClient({ token, approveIntent, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(initial.status !== "pending");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);

  const display = useMemo(
    () => parseHireAccessSnapshot(initial.hireSummary, initial.companyName, initial.termsPreview),
    [initial.companyName, initial.hireSummary, initial.termsPreview],
  );

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        setSignedIn(Boolean(data.user));
        setUserEmail(data.user?.email ?? null);
      });
  }, []);

  const respond = useCallback(
    (approve: boolean) => {
      setError(null);
      startTransition(async () => {
        if (signedIn === false && approve) {
          router.push(`/login?next=${encodeURIComponent(`/hire-access/${token}?intent=approve`)}`);
          return;
        }

        const res = await respondToHireAccessByTokenAction(token, approve);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (res.loginRequired) {
          router.push(`/login?next=${encodeURIComponent(`/hire-access/${token}?intent=approve`)}`);
          return;
        }
        setDone(true);
      });
    },
    [router, signedIn, token],
  );

  const authLoading = signedIn === null;
  const showApproveIntentBanner = Boolean(approveIntent && signedIn && !done);

  return (
    <div className="relative space-y-6">
      {(authLoading || pending) ? (
        <LoadingOverlay label={authLoading ? "Checking sign-in…" : "Processing your response…"} />
      ) : null}

      <div className="space-y-2">
        <h1 className="rph-h1">Hire access request</h1>
        <p className="rph-muted text-sm">
          <strong className="text-rph-fg">{display.companyName}</strong> wants access to your driver profile to
          create a vehicle hire agreement. Review the full details below before you respond.
        </p>
        {signedIn ? (
          <p className="text-sm text-rph-fg-secondary">
            Signed in as <strong className="text-rph-fg">{userEmail ?? "your account"}</strong>.{" "}
            <Link href="/driver/hire-requests" className="text-rph-link underline hover:text-rph-link-hover">
              View all hire requests
            </Link>
          </p>
        ) : null}
      </div>

      <HireAccessDetail display={display} />

      {signedIn === false && !done ? (
        <p className="rounded-xl border border-rph-border bg-rph-chrome/40 px-4 py-3 text-sm text-rph-fg-secondary">
          To approve and share your profile, sign in with the driver account linked to this licence. You can reject
          without signing in.
        </p>
      ) : null}

      {showApproveIntentBanner ? (
        <p className="rounded-xl border border-sky-300/80 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
          You signed in to approve this request. Review the details above, then confirm when you are ready.
        </p>
      ) : null}

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {done ? (
        <div className="rounded-xl border border-emerald-300/80 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          Thank you — your response has been recorded. You can review the hire details above at any time using this
          link.
          {signedIn ? (
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
              disabled={authLoading || pending}
              onClick={() => {
                if (signedIn === false) {
                  respond(true);
                  return;
                }
                setApproveConfirmOpen(true);
              }}
            >
              {pending
                ? "Processing…"
                : signedIn
                  ? approveIntent
                    ? "Confirm approval"
                    : "Approve"
                  : "Sign in to approve"}
            </button>
            <button
              type="button"
              className="rph-btn-ghost min-w-[9rem]"
              disabled={authLoading || pending}
              onClick={() => setRejectConfirmOpen(true)}
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
