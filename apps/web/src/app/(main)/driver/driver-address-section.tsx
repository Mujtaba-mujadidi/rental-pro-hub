"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  updateDriverAddressAction,
  type DriverAddressActionResult,
} from "@/app/actions/driver-address";

const initial: DriverAddressActionResult = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rph-btn-primary-wide sm:mt-0 sm:w-auto">
      {pending ? "Saving…" : label}
    </button>
  );
}

export function DriverAddressSection({
  address_line1,
  address_line2,
  address_town,
  address_county,
  address_postcode,
  previousAddress,
}: {
  address_line1: string;
  address_line2: string | null;
  address_town: string;
  address_county: string | null;
  address_postcode: string;
  previousAddress: {
    line1: string;
    line2: string | null;
    town: string;
    county: string | null;
    postcode: string;
    effectiveTo: string | null;
  } | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateDriverAddressAction, initial);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state.ok, router]);

  return (
    <section className="mt-8 border-t border-slate-200 pt-8 dark:border-slate-700">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Home address</h2>
      <p className="rph-muted mt-1 max-w-xl text-sm">
        Your current address is used across the app. When you update it, we keep your previous address on
        record for reference.
      </p>
      {previousAddress ? (
        <div className="mt-4 max-w-xl rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Previous address</p>
          <dl className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium">Line 1</dt>
              <dd>{previousAddress.line1}</dd>
            </div>
            {previousAddress.line2 ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">Line 2</dt>
                <dd>{previousAddress.line2}</dd>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium">Town</dt>
              <dd>{previousAddress.town}</dd>
            </div>
            {previousAddress.county ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">County</dt>
                <dd>{previousAddress.county}</dd>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium">Postcode</dt>
              <dd>{previousAddress.postcode}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      <form action={formAction} className="mt-4 max-w-xl space-y-4">
        {state.error ? <p className="rph-alert-error">{state.error}</p> : null}
        {state.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
            Address saved.
          </p>
        ) : null}
        <div className="space-y-1">
          <label htmlFor="dash_address_line1" className="rph-label-lg">
            Address line 1
          </label>
          <input
            id="dash_address_line1"
            name="address_line1"
            required
            defaultValue={address_line1}
            autoComplete="street-address"
            className="rph-input-auth"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="dash_address_line2" className="rph-label-lg">
            Address line 2 (optional)
          </label>
          <input
            id="dash_address_line2"
            name="address_line2"
            defaultValue={address_line2 ?? ""}
            autoComplete="address-line2"
            className="rph-input-auth"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="dash_address_town" className="rph-label-lg">
              Town / city
            </label>
            <input
              id="dash_address_town"
              name="address_town"
              required
              defaultValue={address_town}
              autoComplete="address-level2"
              className="rph-input-auth"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="dash_address_county" className="rph-label-lg">
              County (optional)
            </label>
            <input
              id="dash_address_county"
              name="address_county"
              defaultValue={address_county ?? ""}
              autoComplete="address-level1"
              className="rph-input-auth"
            />
          </div>
          <div className="space-y-1 sm:max-w-xs">
            <label htmlFor="dash_address_postcode" className="rph-label-lg">
              UK postcode
            </label>
            <input
              id="dash_address_postcode"
              name="address_postcode"
              required
              defaultValue={address_postcode}
              autoComplete="postal-code"
              className="rph-input-auth"
            />
          </div>
        </div>
        <Submit label="Save address" />
      </form>
    </section>
  );
}
