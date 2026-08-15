"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { SubcompanyWorkspaceShell } from "@/lib/rental/subcompany";
import { invalidateSubcompanySectionCache } from "@/lib/rental/subcompany-section-cache";
import {
  subcompanyWorkspaceHref,
  type SubcompanyWorkspaceSection,
} from "@/lib/rental/subcompany-workspace-nav";

type SubcompanyWorkspaceContextValue = {
  shell: SubcompanyWorkspaceShell;
  /** Null until first client navigation / sync — then always set (including Overview ""). */
  section: SubcompanyWorkspaceSection | null;
  setSection: (section: SubcompanyWorkspaceSection) => void;
  /** Client-side tab change: updates URL without waiting on a full RSC reload. */
  navigateSection: (section: SubcompanyWorkspaceSection) => void;
  /** Re-runs the server layout so `shell` picks up saved changes. */
  refreshShell: () => void;
};

const SubcompanyWorkspaceContext = createContext<SubcompanyWorkspaceContextValue | null>(null);

function sectionFromSearch(search: string): SubcompanyWorkspaceSection {
  const raw = new URLSearchParams(search).get("section");
  if (!raw) return "";
  if (raw === "attention" || raw === "details" || raw === "activity" || raw === "vehicles" || raw === "hires") {
    return raw;
  }
  return "";
}

export function SubcompanyWorkspaceProvider({
  shell,
  children,
}: {
  shell: SubcompanyWorkspaceShell;
  children: ReactNode;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SubcompanyWorkspaceSection | null>(null);

  useEffect(() => {
    setSection(sectionFromSearch(window.location.search));
  }, [shell.subcompany.id]);

  useEffect(() => {
    function onPopState() {
      setSection(sectionFromSearch(window.location.search));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateSection = useCallback(
    (next: SubcompanyWorkspaceSection) => {
      setSection(next);
      const href = subcompanyWorkspaceHref(shell.subcompany.id, next);
      window.history.pushState(null, "", href);
    },
    [shell.subcompany.id],
  );

  const refreshShell = useCallback(() => {
    invalidateSubcompanySectionCache(shell.subcompany.id);
    router.refresh();
  }, [router, shell.subcompany.id]);

  const value = useMemo(
    () => ({ shell, section, setSection, navigateSection, refreshShell }),
    [shell, section, navigateSection, refreshShell],
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
