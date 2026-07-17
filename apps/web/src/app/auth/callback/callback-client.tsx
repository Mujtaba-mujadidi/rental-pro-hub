"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

function safeNextPath(raw: string | null): string {
  const nextPath = raw ?? "/driver";
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return "/driver";
  return nextPath;
}

function setRecoveryCookie() {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `rph_pw_recovery=1; Path=/; Max-Age=600; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function userNeedsPasswordStep(user: User): boolean {
  const appMeta = user.app_metadata as Record<string, unknown> | undefined;
  const invitedAt = appMeta?.invited_at;
  const uMeta = user.user_metadata as Record<string, unknown> | undefined;
  const rentalInvite =
    typeof uMeta?.app_role === "string" && uMeta.app_role.toLowerCase() === "rental_company";
  return (
    typeof invitedAt === "string" ||
    typeof invitedAt === "number" ||
    invitedAt instanceof Date ||
    rentalInvite
  );
}

function defaultPostLoginPath(requestedNext: string, user: User): string {
  const uMeta = user.user_metadata as Record<string, unknown> | undefined;
  const appRole = typeof uMeta?.app_role === "string" ? uMeta.app_role.toLowerCase() : "";
  if (appRole === "rental_company") {
    if (
      requestedNext.startsWith("/rental") ||
      requestedNext === "/super-admin" ||
      (requestedNext.startsWith("/") &&
        !requestedNext.startsWith("//") &&
        requestedNext !== "/driver" &&
        requestedNext !== "/driver/onboarding" &&
        requestedNext !== "/auth/set-password" &&
        requestedNext.length > 1)
    ) {
      return requestedNext;
    }
    return "/rental";
  }

  if (requestedNext === "/auth/set-password") {
    return "/driver";
  }
  if (
    requestedNext !== "/driver" &&
    requestedNext !== "/super-admin" &&
    requestedNext !== "/rental" &&
    requestedNext !== "/driver/onboarding" &&
    requestedNext.length > 1
  ) {
    return requestedNext;
  }
  return "/driver";
}

function CallbackInner() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const requestedNext = safeNextPath(searchParams.get("next"));

    void (async () => {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const origin = url.origin;

      const hashParams = url.hash.startsWith("#") ? new URLSearchParams(url.hash.slice(1)) : new URLSearchParams();
      const oauthError =
        url.searchParams.get("error") ?? hashParams.get("error") ?? null;
      const oauthDesc =
        url.searchParams.get("error_description") ?? hashParams.get("error_description") ?? null;
      if (oauthError) {
        const msg = oauthDesc ?? oauthError;
        window.location.replace(`${origin}/login?error=${encodeURIComponent(msg)}`);
        return;
      }

      const finish = (user: User | null, opts: { forceSetPassword?: boolean; otpType?: string }) => {
        if (!user?.id) {
          window.location.replace(
            `${origin}/login?error=${encodeURIComponent("No user after sign-in.")}`,
          );
          return;
        }

        const forcePw =
          opts.forceSetPassword || opts.otpType === "recovery" || opts.otpType === "invite";
        if (forcePw || userNeedsPasswordStep(user)) {
          setRecoveryCookie();
          window.location.replace(`${origin}/auth/set-password`);
          return;
        }

        const dest = defaultPostLoginPath(requestedNext, user);
        window.location.replace(`${origin}${dest}`);
      };

      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      if (access_token && refresh_token) {
        setMessage("Confirming sign-in…");
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          window.location.replace(`${origin}/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
        finish(data.user, {});
        return;
      }

      let tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      let otpType = url.searchParams.get("type");
      if (!tokenHash || !otpType) {
        tokenHash = hashParams.get("token_hash") ?? hashParams.get("token") ?? tokenHash;
        otpType = hashParams.get("type") ?? otpType;
      }
      if (tokenHash && otpType) {
        setMessage("Confirming sign-in…");
        const { data, error } = await supabase.auth.verifyOtp({
          type: otpType as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
          token_hash: tokenHash,
        });
        if (error) {
          window.location.replace(`${origin}/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
        finish(data.user, {
          forceSetPassword: otpType === "recovery" || otpType === "invite",
          otpType,
        });
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        setMessage("Confirming sign-in…");
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          const msg = error.message.toLowerCase().includes("pkce code verifier not found")
            ? "Could not complete reset because PKCE verifier is missing. This usually means the reset was requested on a different site origin (for example localhost vs production URL) or browser profile. Request a new reset from this same site, then open the email link in this same browser profile."
            : error.message;
          window.location.replace(`${origin}/login?error=${encodeURIComponent(msg)}`);
          return;
        }
        finish(data.user, {});
        return;
      }

      window.location.replace(
        `${origin}/login?error=${encodeURIComponent("Sign-in link is invalid or expired.")}`,
      );
    })();
  }, [searchParams]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col justify-center px-4">
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">{message}</p>
    </div>
  );
}

export function AuthCallbackClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[40vh] max-w-md flex-col justify-center px-4">
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">Loading…</p>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
