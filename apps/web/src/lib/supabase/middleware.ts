import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { resolveSupabasePublishableEnv } from "@/lib/supabase/env";
import { resolveAppHomePath } from "@/lib/auth/driver-redirect";

const protectedPrefixes = ["/super-admin", "/driver", "/rental"];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Fast edge gate: refresh cookies + JWT check only.
 * Heavy role/lifecycle redirects run in route layouts (not on every middleware hop).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: (() => {
        const h = new Headers(request.headers);
        h.set("x-pathname", request.nextUrl.pathname);
        return h;
      })(),
    },
  });

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = resolveSupabasePublishableEnv());
  } catch {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-pathname", request.nextUrl.pathname);
        response = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Cookie/session parse only — no Auth/JWKS round-trip on every navigation.
  // RSC layouts still verify via getClaims/getUser before rendering protected UI.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const hasSession = Boolean(session?.user?.id);

  const path = request.nextUrl.pathname;

  if (!hasSession && isProtectedPath(path)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  // Rare path (post-login landing): resolve home once — not on every tab switch.
  if (hasSession && (path === "/login" || path === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    if (next?.startsWith("/") && !next.startsWith("//")) {
      const redirectUrl = request.nextUrl.clone();
      const parsed = new URL(next, request.nextUrl.origin);
      redirectUrl.pathname = parsed.pathname;
      redirectUrl.search = parsed.search;
      return NextResponse.redirect(redirectUrl);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = await resolveAppHomePath(supabase, user.id, user.email);
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
