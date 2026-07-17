"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";

/** Login and sign-up only: force light UI without overwriting the user’s stored theme. */
function authLightOnlyPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/login" || pathname === "/signup";
}

/**
 * next-themes injects an inline <script> to avoid theme flash. React 19 / Next 16 warn about
 * <script> inside client components even though SSR executes it correctly (false positive).
 * @see https://github.com/pacocoursey/next-themes/issues/387
 */
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    const message =
      typeof first === "string"
        ? first
        : first instanceof Error
          ? first.message
          : "";
    if (message.includes("Encountered a script tag while rendering React component")) {
      return;
    }
    original.apply(console, args as Parameters<typeof console.error>);
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forcedTheme = authLightOnlyPath(pathname) ? "light" : undefined;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      enableColorScheme
      storageKey="theme"
      forcedTheme={forcedTheme}
      // On the client, mark the bootstrap script as non-JS so React 19 does not warn.
      // During SSR the default executable script still runs (FOUC prevention).
      scriptProps={typeof window === "undefined" ? undefined : { type: "application/json" }}
    >
      {children}
    </ThemeProvider>
  );
}
