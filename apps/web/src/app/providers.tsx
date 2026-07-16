"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";

/** Login and sign-up only: force light UI without overwriting the user’s stored theme. */
function authLightOnlyPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/login" || pathname === "/signup";
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
    >
      {children}
    </ThemeProvider>
  );
}
