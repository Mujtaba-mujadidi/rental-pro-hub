"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import type { HireWorkspaceShell } from "@/lib/fleet/load-hire-workspace-shell";

type HireWorkspaceContextValue = {
  shell: HireWorkspaceShell;
  chrome: HireWorkspaceChromeData;
};

const HireWorkspaceContext = createContext<HireWorkspaceContextValue | null>(null);

export function HireWorkspaceProvider({
  shell,
  chrome,
  children,
}: {
  shell: HireWorkspaceShell;
  chrome: HireWorkspaceChromeData;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ shell, chrome }), [shell, chrome]);
  return <HireWorkspaceContext.Provider value={value}>{children}</HireWorkspaceContext.Provider>;
}

export function useHireWorkspace() {
  const ctx = useContext(HireWorkspaceContext);
  if (!ctx) throw new Error("useHireWorkspace must be used within HireWorkspaceProvider.");
  return ctx;
}
