"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef } from "react";

const DEBOUNCE_MS = 300;
/** Avoid router.refresh storms when several realtime hooks fire together. */
const MIN_REFRESH_INTERVAL_MS = 5_000;

function useDebouncedCallback(fn: () => void, debounceMs = DEBOUNCE_MS) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounced = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(), debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debounced;
}

/** Refresh contract-change UI when requests change for a company (rental) or globally (super admin). */
export function useContractChangeRealtime(
  onRefresh: () => void,
  options?: { parentCompanyId?: string; enabled?: boolean },
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const lastRefreshAtRef = useRef(0);
  const debouncedRefresh = useDebouncedCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    onRefreshRef.current();
  });

  useEffect(() => {
    if (options?.enabled === false) return;

    const supabase = createClient();
    const filter = options?.parentCompanyId
      ? `parent_company_id=eq.${options.parentCompanyId}`
      : undefined;

    const channel = supabase
      .channel(`contract-changes:${options?.parentCompanyId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_contract_change_requests",
          ...(filter ? { filter } : {}),
        },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [options?.parentCompanyId, options?.enabled, debouncedRefresh]);
}
