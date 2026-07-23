"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { HireWorkspaceShell } from "@/lib/fleet/load-hire-workspace-shell";

type HireWorkspaceContextValue = {
  shell: HireWorkspaceShell;
};

const HireWorkspaceContext = createContext<HireWorkspaceContextValue | null>(null);

export function HireWorkspaceProvider({
  shell,
  children,
}: {
  shell: HireWorkspaceShell;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ shell }), [shell]);
  return <HireWorkspaceContext.Provider value={value}>{children}</HireWorkspaceContext.Provider>;
}

export function useHireWorkspace() {
  const ctx = useContext(HireWorkspaceContext);
  if (!ctx) throw new Error("useHireWorkspace must be used within HireWorkspaceProvider.");
  return ctx;
}
