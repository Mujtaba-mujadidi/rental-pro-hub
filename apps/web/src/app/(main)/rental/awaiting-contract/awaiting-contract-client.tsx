"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { RentalRenewalSigningActions } from "../rental-renewal-signing-actions";

const btn =
  "inline-flex items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

export function AwaitingContractClient({
  renewalSignaturePending = false,
  signReady = false,
  signBlockedReason = null,
  dashboardAccess = false,
  signError = null,
}: {
  renewalSignaturePending?: boolean;
  signReady?: boolean;
  signBlockedReason?: string | null;
  dashboardAccess?: boolean;
  signError?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const recheck = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <h1 className="rph-h1">
        {renewalSignaturePending ? "Renewal contract awaiting signature" : "Agreement not active yet"}
      </h1>
      {renewalSignaturePending ? (
        <>
          <p className="rph-muted text-sm leading-relaxed">
            Your legal detail change was approved and a new platform agreement is waiting to be signed.
            {dashboardAccess
              ? " You can continue using your dashboard, but you must sign the renewal contract below."
              : " Please sign the renewal contract to continue."}
          </p>
          <p className="rph-muted text-sm leading-relaxed">
            Open the contract here if you closed the signing page, or use the email link sent to your signatory contact.
          </p>
        </>
      ) : (
        <>
          <p className="rph-muted text-sm leading-relaxed">
            Your rental company account is set up, but the platform agreement is still waiting to be completed. This is
            normal if you have not finished e-signing yet, or if your organisation is still being set up by our team.
          </p>
          <p className="rph-muted text-sm leading-relaxed">
            Once the agreement is active, you will move on to onboarding automatically. If you were invited before
            signing (admin override), full access starts only after the contract is marked active.
          </p>
        </>
      )}

      {signError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
          {signError}
        </p>
      ) : null}

      {renewalSignaturePending ? (
        <RentalRenewalSigningActions
          signReady={signReady}
          signBlockedReason={signBlockedReason}
          showDashboardLink={dashboardAccess}
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" className={btn} disabled={pending} onClick={recheck}>
          {pending ? "Checking…" : "I’ve signed — check again"}
        </button>
      </div>
    </div>
  );
}
