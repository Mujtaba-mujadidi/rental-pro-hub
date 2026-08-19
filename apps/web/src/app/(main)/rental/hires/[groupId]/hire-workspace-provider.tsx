"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import type { HireWorkspaceShell } from "@/lib/fleet/load-hire-workspace-shell";
import {
  hireWorkspaceKeysInvalidatedByPaymentChange,
  hireWorkspacePaymentRealtimeEnabled,
  type HireWorkspaceCacheKey,
} from "@/lib/fleet/hire-workspace-tab-cache";

type HireWorkspaceContextValue = {
  shell: HireWorkspaceShell;
  chrome: HireWorkspaceChromeData;
  cacheEpoch: number;
  readCache: (key: HireWorkspaceCacheKey) => unknown;
  writeCache: (key: HireWorkspaceCacheKey, value: unknown) => void;
  invalidateCache: (keys: readonly HireWorkspaceCacheKey[]) => void;
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
  const cacheRef = useRef<Partial<Record<HireWorkspaceCacheKey, unknown>>>({});
  const [cacheEpoch, setCacheEpoch] = useState(0);
  const hireGroupIdRef = useRef(shell.hireGroupId);

  useEffect(() => {
    if (hireGroupIdRef.current === shell.hireGroupId) return;
    hireGroupIdRef.current = shell.hireGroupId;
    cacheRef.current = {};
    setCacheEpoch((n) => n + 1);
  }, [shell.hireGroupId]);

  const readCache = useCallback((key: HireWorkspaceCacheKey) => cacheRef.current[key], []);

  const writeCache = useCallback((key: HireWorkspaceCacheKey, value: unknown) => {
    cacheRef.current = { ...cacheRef.current, [key]: value };
  }, []);

  const invalidateCache = useCallback((keys: readonly HireWorkspaceCacheKey[]) => {
    if (!keys.length) return;
    const next = { ...cacheRef.current };
    for (const key of keys) delete next[key];
    cacheRef.current = next;
    setCacheEpoch((n) => n + 1);
  }, []);

  useHirePaymentsRealtime(
    shell.hireGroupId,
    () => invalidateCache(hireWorkspaceKeysInvalidatedByPaymentChange()),
    { enabled: hireWorkspacePaymentRealtimeEnabled(chrome.contractEnded) },
  );

  const value = useMemo(
    () => ({
      shell,
      chrome,
      cacheEpoch,
      readCache,
      writeCache,
      invalidateCache,
    }),
    [shell, chrome, cacheEpoch, readCache, writeCache, invalidateCache],
  );

  return <HireWorkspaceContext.Provider value={value}>{children}</HireWorkspaceContext.Provider>;
}

export function useHireWorkspace() {
  const ctx = useContext(HireWorkspaceContext);
  if (!ctx) throw new Error("useHireWorkspace must be used within HireWorkspaceProvider.");
  return ctx;
}

export function useHireWorkspaceCache() {
  return useContext(HireWorkspaceContext);
}
