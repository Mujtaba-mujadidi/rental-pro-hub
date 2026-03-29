"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signInAction, type ActionResult } from "@/app/actions/auth";

const initial: ActionResult = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-rph-rail text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50"
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}

export function LoginForm({
  registered,
  nextPath,
  configError,
  serverError,
}: {
  registered: boolean;
  nextPath?: string;
  configError?: boolean;
  serverError?: string;
}) {
  const [state, formAction] = useFormState(signInAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      {configError ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          App configuration error: check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
        </p>
      ) : null}
      {serverError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {serverError}
        </p>
      ) : null}
      {registered ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Account created. If email confirmation is enabled in Supabase, confirm
          your email, then log in.
        </p>
      ) : null}
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20"
        />
      </div>
      {nextPath ? (
        <input type="hidden" name="next" value={nextPath} readOnly />
      ) : null}
      <Submit label="Log in" />
    </form>
  );
}
