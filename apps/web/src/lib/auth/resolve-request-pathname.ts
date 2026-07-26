/**
 * Resolve the current pathname for server layouts.
 * Middleware sets `x-pathname`, but RSC refreshes may omit it — never guess `/rental`.
 */
export function resolveRequestPathname(
  headerGet: (name: string) => string | null | undefined,
): string | null {
  const direct = headerGet("x-pathname")?.trim();
  if (direct?.startsWith("/")) return direct;

  const nextUrl = headerGet("next-url") ?? headerGet("x-url");
  if (nextUrl) {
    try {
      const path = nextUrl.startsWith("http")
        ? new URL(nextUrl).pathname
        : nextUrl.split("?")[0]?.trim();
      if (path?.startsWith("/")) return path;
    } catch {
      // ignore malformed header
    }
  }

  const referer = headerGet("referer");
  if (referer) {
    try {
      return new URL(referer).pathname;
    } catch {
      // ignore malformed referer
    }
  }

  return null;
}

/**
 * Pathname safe for lifecycle redirects. Referer can point at a previous route during RSC
 * refresh and cause redirect loops, so omit it here.
 */
export function resolveRequestPathnameForRedirect(
  headerGet: (name: string) => string | null | undefined,
): string | null {
  const direct = headerGet("x-pathname")?.trim();
  if (direct?.startsWith("/")) return direct;

  const nextUrl = headerGet("next-url") ?? headerGet("x-url");
  if (nextUrl) {
    try {
      const path = nextUrl.startsWith("http")
        ? new URL(nextUrl).pathname
        : nextUrl.split("?")[0]?.trim();
      if (path?.startsWith("/")) return path;
    } catch {
      // ignore malformed header
    }
  }

  return null;
}
