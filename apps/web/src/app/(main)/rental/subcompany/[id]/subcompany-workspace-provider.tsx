"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SubcompanyWorkspaceShell } from "@/lib/rental/subcompany";

type SubcompanyWorkspaceContextValue = {
  shell: SubcompanyWorkspaceShell;
  /** Re-runs the server layout so `shell` picks up saved changes. */
  refreshShell: () => void;
};

const SubcompanyWorkspaceContext = createContext<SubcompanyWorkspaceContextValue | null>(null);

export function SubcompanyWorkspaceProvider({
  shell,
  children,
}: {
  shell: SubcompanyWorkspaceShell;
  children: ReactNode;
}) {
  const router = useRouter();
  const value = useMemo(
    () => ({ shell, refreshShell: () => router.refresh() }),
    [shell, router],
  );
  return (
    <SubcompanyWorkspaceContext.Provider value={value}>{children}</SubcompanyWorkspaceContext.Provider>
  );
}

export function useSubcompanyWorkspace() {
  const ctx = useContext(SubcompanyWorkspaceContext);
  if (!ctx) throw new Error("useSubcompanyWorkspace must be used within SubcompanyWorkspaceProvider.");
  return ctx;
}
