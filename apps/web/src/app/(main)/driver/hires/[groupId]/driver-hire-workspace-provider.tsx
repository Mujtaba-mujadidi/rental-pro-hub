"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { DriverHireWorkspaceShell } from "@/lib/fleet/driver-hire-types";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";

type DriverHireWorkspaceContextValue = {
  shell: DriverHireWorkspaceShell;
  chrome: HireWorkspaceChromeData;
};

const DriverHireWorkspaceContext = createContext<DriverHireWorkspaceContextValue | null>(null);

export function DriverHireWorkspaceProvider({
  shell,
  chrome,
  children,
}: {
  shell: DriverHireWorkspaceShell;
  chrome: HireWorkspaceChromeData;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ shell, chrome }), [shell, chrome]);
  return (
    <DriverHireWorkspaceContext.Provider value={value}>{children}</DriverHireWorkspaceContext.Provider>
  );
}

export function useDriverHireWorkspace() {
  const ctx = useContext(DriverHireWorkspaceContext);
  if (!ctx) throw new Error("useDriverHireWorkspace must be used within DriverHireWorkspaceProvider.");
  return ctx;
}
