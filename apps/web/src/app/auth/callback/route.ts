import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveSupabasePublishableEnv } from "@/lib/supabase/env";
import { resolveDriverHomePath } from "@/lib/auth/driver-redirect";

function safeNextPath(raw: string | null): string {
  const nextPath = raw ?? "/driver";
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return "/driver";
  return nextPath;
}

function redirectWithOptionalRecoveryCookie(origin: string, destinationPath: string): NextResponse {
  const res = NextResponse.redirect(`${origin}${destinationPath}`);
  if (destinationPath === "/auth/set-password") {
    res.cookies.set("rph_pw_recovery", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const requestedNext = safeNextPath(searchParams.get("next"));

  const oauthError = searchParams.get("error");
  const oauthDesc = searchParams.get("error_description");
  if (oauthError) {
    const msg = oauthDesc ?? oauthError;
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  }

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = resolveSupabasePublishableEnv());
  } catch {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });

  const code = searchParams.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
    const u = data.user;
    if (!u?.id) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("No user after sign-in.")}`,
      );
    }
    const dest =
      requestedNext === "/auth/set-password"
        ? "/auth/set-password"
        : requestedNext !== "/driver" && requestedNext !== "/super-admin"
          ? requestedNext
          : await resolveDriverHomePath(supabase, u.id, u.email);
    return redirectWithOptionalRecoveryCookie(origin, dest);
  }

  const tokenHash = searchParams.get("token_hash") ?? searchParams.get("token");
  const otpType = searchParams.get("type");
  if (tokenHash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: otpType as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
    const u = data.user;
    if (!u?.id) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("No user after sign-in.")}`,
      );
    }
    const dest =
      otpType === "recovery"
        ? "/auth/set-password"
        : requestedNext !== "/driver" && requestedNext !== "/super-admin"
          ? requestedNext
          : await resolveDriverHomePath(supabase, u.id, u.email);
    return redirectWithOptionalRecoveryCookie(origin, dest);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Sign-in link is invalid or expired.")}`,
  );
}
