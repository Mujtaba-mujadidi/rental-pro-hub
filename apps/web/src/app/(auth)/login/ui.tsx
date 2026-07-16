"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { signInAction, type ActionResult } from "@/app/actions/auth";
import { userMessageForSupabaseAuthEmailError } from "@/lib/auth/supabase-auth-user-message";
import { createClient } from "@/lib/supabase/client";

const initial: ActionResult = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-rph-rail text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50"
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Please wait…
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** Short UI cooldown after a rate-limit error to avoid hammering the API; Supabase’s own window is usually much longer. */
const RESET_COOLDOWN_AFTER_RATE_LIMIT_SEC = 90;

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const resetRequestInFlight = useRef(false);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec]);

  async function handleResetSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (cooldownSec > 0 || resetRequestInFlight.current) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter the email address you use to sign in.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }

    // Use the current browser origin to keep PKCE verifier and callback on the same site.
    const redirectTo = `${window.location.origin}/auth/callback`;

    resetRequestInFlight.current = true;
    setPending(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });

      if (err) {
        const isRate =
          err.code === "over_email_send_rate_limit" ||
          err.code === "over_request_rate_limit" ||
          err.message.toLowerCase().includes("rate limit");
        if (isRate) {
          setCooldownSec(RESET_COOLDOWN_AFTER_RATE_LIMIT_SEC);
        }
        setError(userMessageForSupabaseAuthEmailError(err));
        return;
      }
      setOk(true);
    } finally {
      resetRequestInFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="relative space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      {pending ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/85 dark:bg-slate-950/85"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-300 border-t-rph-rail" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Sending reset link…</p>
        </div>
      ) : null}
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Forgot your password?</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enter your account email and we&apos;ll send a link to choose a new password. Drivers, rental company
          contacts, and admins all use the same reset flow. Only request another link if the previous one did not
          arrive. Supabase usually enforces a long gap before it will send another reset to the same address.
        </p>
      </div>
      {ok ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/50">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Reset email sent</p>
          <p className="text-sm text-emerald-900/90 dark:text-emerald-100/90">
            If an account exists for <span className="font-medium">{email.trim()}</span>, you&apos;ll receive a
            message shortly. Open the link, then set a new password on the next page.
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900/50 dark:bg-red-950/40">
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">Couldn’t send reset link</p>
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      ) : null}
      {!ok ? (
        <form onSubmit={handleResetSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="reset_email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="reset_email"
              name="reset_email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={pending || cooldownSec > 0}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-rph-rail text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50"
          >
            {pending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Sending…
              </>
            ) : cooldownSec > 0 ? (
              `Try again in ${cooldownSec}s`
            ) : (
              "Send reset link"
            )}
          </button>
        </form>
      ) : null}
      <div className="flex justify-start">
        <button
          type="button"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={onBack}
        >
          Back to log in
        </button>
      </div>
    </div>
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
  const [state, formAction] = useActionState(signInAction, initial);
  const [showForgot, setShowForgot] = useState(false);

  if (showForgot) {
    return <ForgotPasswordForm onBack={() => setShowForgot(false)} />;
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        {configError ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            App configuration error: check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        ) : null}
        {serverError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {serverError}
          </p>
        ) : null}
        {registered ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
            Account created. If email confirmation is enabled in Supabase, confirm your email, then log in.
          </p>
        ) : null}
        {state.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {state.error}
          </p>
        ) : null}
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rph-rail focus:ring-2 focus:ring-rph-rail/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        {nextPath ? <input type="hidden" name="next" value={nextPath} readOnly /> : null}
        <div className="flex flex-col gap-1">
          <Submit label="Log in" />
          <div className="flex justify-end">
            <button
              type="button"
              className="text-sm font-medium text-red-600 underline decoration-red-600/50 underline-offset-2 hover:text-red-700 hover:decoration-red-700/60 dark:text-red-400 dark:decoration-red-400/50 dark:hover:text-red-300"
              onClick={() => setShowForgot(true)}
            >
              Forgot password?
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
