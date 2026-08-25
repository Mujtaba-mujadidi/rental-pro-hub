"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef } from "react";

const DEBOUNCE_MS = 350;

type RefreshOptions = {
  enabled?: boolean;
};

function useDebouncedRefresh(onRefresh: () => void, debounceMs = DEBOUNCE_MS) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounced = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onRefreshRef.current(), debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debounced;
}

/** Reload when a hire draft or linked driver-access request changes (wizard step 4). */
export function useHireDraftRealtime(
  hireGroupId: string | null | undefined,
  onRefresh: () => void,
  options?: RefreshOptions,
) {
  const debouncedRefresh = useDebouncedRefresh(onRefresh);

  useEffect(() => {
    if (options?.enabled === false || !hireGroupId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`hire-draft:${hireGroupId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vehicle_hire_groups",
          filter: `id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_driver_access_requests",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hireGroupId, options?.enabled, debouncedRefresh]);
}

/** Reload hire contract lists when rows change (RLS scopes events to the signed-in company). */
export function useHireContractsRealtime(
  onRefresh: () => void,
  options?: RefreshOptions & { vehicleId?: string },
) {
  const debouncedRefresh = useDebouncedRefresh(onRefresh);
  const vehicleId = options?.vehicleId?.trim();

  useEffect(() => {
    if (options?.enabled === false) return;

    const supabase = createClient();
    const channelName = vehicleId ? `hire-contracts:vehicle:${vehicleId}` : "hire-contracts:fleet";
    const groupChangeOpts = vehicleId
      ? {
          event: "*" as const,
          schema: "public" as const,
          table: "vehicle_hire_groups" as const,
          filter: `vehicle_id=eq.${vehicleId}`,
        }
      : {
          event: "*" as const,
          schema: "public" as const,
          table: "vehicle_hire_groups" as const,
        };

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", groupChangeOpts, debouncedRefresh)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_driver_access_requests",
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_agreements",
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vehicle_hire_group_events",
        },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [vehicleId, options?.enabled, debouncedRefresh]);
}

/** Reload when new hire access requests arrive or status changes (driver inbox). */
export function useDriverHireAccessRealtime(onRefresh: () => void, options?: RefreshOptions) {
  const debouncedRefresh = useDebouncedRefresh(onRefresh);

  useEffect(() => {
    if (options?.enabled === false) return;

    const supabase = createClient();
    const channel = supabase
      .channel("driver-hire-access-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_driver_access_requests",
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_groups",
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_agreements",
        },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [options?.enabled, debouncedRefresh]);
}

/** Reload hire payment sheet when schedule, discounts, status, balance, or extra-charge rows change. */
export function useHirePaymentsRealtime(
  hireGroupId: string | null | undefined,
  onRefresh: () => void,
  options?: RefreshOptions & { channelPrefix?: string },
) {
  const debouncedRefresh = useDebouncedRefresh(onRefresh);
  const channelPrefix = options?.channelPrefix?.trim() || "hire-payments";

  useEffect(() => {
    if (options?.enabled === false || !hireGroupId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`${channelPrefix}:${hireGroupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_payment_schedule",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_schedule_discounts",
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_payment_status_events",
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_balance_payments",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_balance_notes",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_driver_charge_line_items",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vehicle_hire_group_events",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_financial_summary",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_hire_payment_allocations",
          filter: `hire_group_id=eq.${hireGroupId}`,
        },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hireGroupId, options?.enabled, channelPrefix, debouncedRefresh]);
}
