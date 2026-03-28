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
      className="mt-2 flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}

export function LoginForm({
  registered,
  nextPath,
}: {
  registered: boolean;
  nextPath?: string;
}) {
  const [state, formAction] = useFormState(signInAction, initial);

  return (
    <form action={formAction} className="space-y-4">
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
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-zinc-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2"
        />
      </div>
      {nextPath ? (
        <input type="hidden" name="next" value={nextPath} readOnly />
      ) : null}
      <Submit label="Log in" />
    </form>
  );
}
