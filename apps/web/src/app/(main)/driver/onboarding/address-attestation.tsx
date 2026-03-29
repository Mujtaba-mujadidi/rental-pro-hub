"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  confirmLicencesMatchAddressAction,
  type ConfirmAddressLicenceResult,
} from "@/app/actions/driver-onboarding";

const initial: ConfirmAddressLicenceResult = {};

const btnOutline =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rph-btn-primary-wide mt-0 sm:w-auto">
      {pending ? "Saving…" : label}
    </button>
  );
}

/** Step 2 of 2: attest PHV licence; includes hidden marker that step 1 (driving) was confirmed in-app. */
export function AddressLicenceAttestPhvStep({ onBack }: { onBack: () => void }) {
  const [state, formAction] = useActionState(confirmLicencesMatchAddressAction, initial);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Step 2 of 2 — PHV / taxi licence
      </h3>
      <p className="rph-muted mt-1 text-sm">
        Confirm that your PHV / taxi licence details and photo on file are correct for your current address.
      </p>
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="confirm_driving_attested" value="yes" />
        {state.error ? <p className="rph-alert-error">{state.error}</p> : null}
        <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50">
          <input
            type="checkbox"
            name="confirm_phv_matches_address"
            value="on"
            required
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-rph-rail focus:ring-rph-rail/30"
          />
          <span className="text-sm text-slate-800 dark:text-slate-200">
            I confirm my PHV / taxi licence number, licensing authority, expiry, and photo match my current
            address and are up to date.
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={btnOutline} onClick={onBack}>
            Back
          </button>
          <Submit label="Confirm and go to dashboard" />
        </div>
      </form>
    </div>
  );
}
