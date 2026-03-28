"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  adminAddStaffAction,
  createSubcompanyAction,
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

export function AdminSubcompanyForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useFormState(createSubcompanyAction, initial);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Add subcompany</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Subcompanies belong to this parent company.
      </p>
      {state.error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Subcompany created.
        </p>
      ) : null}
      <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="company_id" value={companyId} readOnly />
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-zinc-600" htmlFor="s_name">
            Name
          </label>
          <input
            id="s_name"
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600" htmlFor="s_email">
            Email
          </label>
          <input
            id="s_email"
            name="email"
            type="email"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600" htmlFor="s_contact">
            Contact
          </label>
          <input
            id="s_contact"
            name="contact_number"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-zinc-600" htmlFor="s_address">
            Address
          </label>
          <input
            id="s_address"
            name="address"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600" htmlFor="s_co">
            Company no.
          </label>
          <input
            id="s_co"
            name="company_no"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end sm:col-span-2">
          <Submit label="Create subcompany" />
        </div>
      </form>
    </section>
  );
}

export function AddStaffForm({ companyId }: { companyId: string }) {
  const [state, formAction] = useFormState(adminAddStaffAction, initial);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Link staff by email</h2>
      <p className="mt-1 text-xs text-zinc-500">
        The person must already have signed up. They become company staff with the
        owner role for this company.
      </p>
      {state.error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Staff linked.
        </p>
      ) : null}
      <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="company_id" value={companyId} readOnly />
        <div>
          <label className="text-xs font-medium text-zinc-600" htmlFor="st_email">
            Email
          </label>
          <input
            id="st_email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600" htmlFor="st_name">
            Display name
          </label>
          <input
            id="st_name"
            name="display_name"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <Submit label="Link staff" />
        </div>
      </form>
    </section>
  );
}
