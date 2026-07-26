"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resendRentalContractRenewalSigningEmailAction } from "@/app/actions/rental-contract-signing";

const btn =
  "inline-flex items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

const btnGhost =
  "inline-flex items-center justify-center rounded-lg border border-rph-border px-4 py-2.5 text-sm font-semibold text-rph-fg hover:bg-rph-chrome disabled:opacity-50";

export function RentalRenewalSigningActions({
  signReady,
  signBlockedReason,
  showDashboardLink = false,
}: {
  signReady: boolean;
  signBlockedReason: string | null;
  showDashboardLink?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {showDashboardLink ? (
          <Link href="/rental" className={btnGhost}>
            Go to dashboard
          </Link>
        ) : null}
        {signReady ? (
          <>
            <Link href="/rental/contract-renewal/sign" className={btn}>
              Open contract to sign
            </Link>
            <button
              type="button"
              className={btnGhost}
              disabled={pending}
              onClick={() => {
                setError(null);
                setNotice(null);
                startTransition(async () => {
                  const res = await resendRentalContractRenewalSigningEmailAction();
                  if (!res.ok) setError(res.error);
                  else setNotice("Signing link emailed to the signatory address.");
                });
              }}
            >
              {pending ? "Sending…" : "Email me the link again"}
            </button>
          </>
        ) : null}
      </div>
      {!signReady && signBlockedReason ? (
        <p className="text-sm text-amber-900 dark:text-amber-100">{signBlockedReason}</p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
