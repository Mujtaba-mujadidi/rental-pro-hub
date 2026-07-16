"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

const btn =
  "inline-flex items-center justify-center rounded-lg bg-rph-rail px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

export function AwaitingContractClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const recheck = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <h1 className="rph-h1">Agreement not active yet</h1>
      <p className="rph-muted text-sm leading-relaxed">
        Your rental company account is set up, but the platform agreement is still waiting to be completed. This is normal
        if you have not finished e-signing yet, or if your organisation is still being set up by our team.
      </p>
      <p className="rph-muted text-sm leading-relaxed">
        Once the agreement is active, you will move on to onboarding automatically. If you were invited before signing
        (admin override), full access starts only after the contract is marked active.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btn} disabled={pending} onClick={recheck}>
          {pending ? "Checking…" : "I’ve signed — check again"}
        </button>
      </div>
    </div>
  );
}
