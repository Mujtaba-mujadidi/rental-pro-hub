"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { DriverHireWorkspaceShell } from "@/lib/fleet/driver-hire-types";

type DriverHireWorkspaceContextValue = {
  shell: DriverHireWorkspaceShell;
};

const DriverHireWorkspaceContext = createContext<DriverHireWorkspaceContextValue | null>(null);

export function DriverHireWorkspaceProvider({
  shell,
  children,
}: {
  shell: DriverHireWorkspaceShell;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ shell }), [shell]);
  return (
    <DriverHireWorkspaceContext.Provider value={value}>{children}</DriverHireWorkspaceContext.Provider>
  );
}

export function useDriverHireWorkspace() {
  const ctx = useContext(DriverHireWorkspaceContext);
  if (!ctx) throw new Error("useDriverHireWorkspace must be used within DriverHireWorkspaceProvider.");
  return ctx;
}
