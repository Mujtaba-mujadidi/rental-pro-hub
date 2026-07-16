"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setPasswordAfterRecoveryAction,
  type SetPasswordRecoveryResult,
} from "@/app/actions/set-password-recovery";

const initial: SetPasswordRecoveryResult = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-rph-rail text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Saving…
        </>
      ) : (
        label
      )}
    </button>
  );
}

export function SetPasswordForm() {
  const [state, action] = useActionState(setPasswordAfterRecoveryAction, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900/50 dark:bg-red-950/40">
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">Couldn’t save password</p>
          <p className="text-sm text-red-800 dark:text-red-200">{state.error}</p>
        </div>
      ) : null}
      <div className="space-y-1">
        <label htmlFor="recovery_pw" className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          New password
        </label>
        <input
          id="recovery_pw"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-900 shadow-sm focus:border-rph-rail focus:outline-none focus:ring-1 focus:ring-rph-rail dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="recovery_pw2" className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          Confirm password
        </label>
        <input
          id="recovery_pw2"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-slate-900 shadow-sm focus:border-rph-rail focus:outline-none focus:ring-1 focus:ring-rph-rail dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      <Submit label="Save new password" />
    </form>
  );
}
