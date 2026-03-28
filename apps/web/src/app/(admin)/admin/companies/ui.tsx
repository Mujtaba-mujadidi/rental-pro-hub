"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  createRentalCompanyAction,
  type ActionResult,
} from "@/app/actions/tenant";

const initial: ActionResult = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function CreateCompanyForm() {
  const [state, formAction] = useFormState(createRentalCompanyAction, initial);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Create company</h2>
      {state.error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Company created.
        </p>
      ) : null}
      <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-zinc-600" htmlFor="c_name">
            Name
          </label>
          <input
            id="c_name"
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600" htmlFor="c_email">
            Email
          </label>
          <input
            id="c_email"
            name="email"
            type="email"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600" htmlFor="c_contact">
            Contact number
          </label>
          <input
            id="c_contact"
            name="contact_number"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-zinc-600" htmlFor="c_address">
            Address
          </label>
          <input
            id="c_address"
            name="address"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-zinc-600" htmlFor="c_reg">
            Company registration no.
          </label>
          <input
            id="c_reg"
            name="company_reg_no"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <Submit label="Create company" />
      </form>
    </section>
  );
}
