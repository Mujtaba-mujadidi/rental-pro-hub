"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef } from "react";

const DEBOUNCE_MS = 300;
const POLL_MS = 15_000;

type Options = {
  enabled?: boolean;
  pollMs?: number;
};

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

/** Refresh notification UI when rows are inserted/updated for the signed-in user. */
export function usePlatformNotificationsRealtime(
  userId: string,
  onRefresh: () => void,
  options?: Options,
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const debouncedRefresh = useDebouncedCallback(() => onRefreshRef.current());

  useEffect(() => {
    if (options?.enabled === false || !userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`platform-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "platform_notifications",
          filter: `user_id=eq.${userId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "platform_notifications",
          filter: `user_id=eq.${userId}`,
        },
        debouncedRefresh,
      )
      .subscribe();

    const pollMs = options?.pollMs ?? POLL_MS;
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") debouncedRefresh();
    }, pollMs);

    const onFocus = () => debouncedRefresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") debouncedRefresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [userId, options?.enabled, options?.pollMs, debouncedRefresh]);
}
