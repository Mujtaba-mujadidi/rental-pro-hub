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
  pending_address_line1,
  pending_address_line2,
  pending_address_town,
  pending_address_county,
  pending_address_postcode,
  pending_address_submitted_at,
}: {
  address_line1: string;
  address_line2: string | null;
  address_town: string;
  address_county: string | null;
  address_postcode: string;
  pending_address_line1: string | null;
  pending_address_line2: string | null;
  pending_address_town: string | null;
  pending_address_county: string | null;
  pending_address_postcode: string | null;
  pending_address_submitted_at: string | null;
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
        Update your address in two stages: submit the new address first (saved as pending), then upload
        updated licence images on the Licences page once your new documents arrive.
      </p>
      {pending_address_submitted_at ? (
        <div className="mt-4 max-w-xl rounded-xl border border-amber-300/90 bg-amber-50 px-4 py-3 dark:border-amber-800/80 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Pending address awaiting verification
          </p>
          <p className="mt-1 text-sm text-amber-950/85 dark:text-amber-100/85">
            Upload replacement licence images to confirm your new address when you can. Until then, your
            current verified address remains in use.
          </p>
          <dl className="mt-3 space-y-1 text-sm text-amber-950/90 dark:text-amber-100/90">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium">Line 1</dt>
              <dd>{pending_address_line1 ?? "—"}</dd>
            </div>
            {pending_address_line2 ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">Line 2</dt>
                <dd>{pending_address_line2}</dd>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium">Town</dt>
              <dd>{pending_address_town ?? "—"}</dd>
            </div>
            {pending_address_county ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium">County</dt>
                <dd>{pending_address_county}</dd>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium">Postcode</dt>
              <dd>{pending_address_postcode ?? "—"}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      <form action={formAction} className="mt-4 max-w-xl space-y-4">
        {state.error ? <p className="rph-alert-error">{state.error}</p> : null}
        {state.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
            Address submitted. Upload updated licence images to verify it.
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
        <Submit label="Submit new address (pending)" />
      </form>
    </section>
  );
}
