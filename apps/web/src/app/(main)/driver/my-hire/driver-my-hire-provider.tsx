"use client";

import {
  loadDriverMyHirePaymentScheduleAction,
  loadDriverMyHireRentalDetailsAction,
  loadDriverMyHireShellAction,
  type DriverMyHirePaymentRow,
  type DriverMyHireRentalDetails,
  type DriverMyHireShellRow,
} from "@/app/actions/driver-hires";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SectionCache<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type DriverMyHireContextValue = {
  shell: SectionCache<DriverMyHireShellRow[]>;
  reloadShell: () => Promise<DriverMyHireShellRow[] | null>;
  rentalDetails: Record<string, SectionCache<DriverMyHireRentalDetails>>;
  paymentSchedule: Record<string, SectionCache<DriverMyHirePaymentRow[]>>;
  ensureRentalDetails: (hireGroupId: string) => Promise<DriverMyHireRentalDetails | null>;
  ensurePaymentSchedule: (hireGroupId: string) => Promise<DriverMyHirePaymentRow[] | null>;
};

const DriverMyHireContext = createContext<DriverMyHireContextValue | null>(null);

function emptySection<T>(): SectionCache<T> {
  return { data: null, loading: false, error: null };
}

export function DriverMyHireProvider({ children }: { children: ReactNode }) {
  const [shell, setShell] = useState<SectionCache<DriverMyHireShellRow[]>>(emptySection);
  const [rentalDetails, setRentalDetails] = useState<Record<string, SectionCache<DriverMyHireRentalDetails>>>(
    {},
  );
  const [paymentSchedule, setPaymentSchedule] = useState<
    Record<string, SectionCache<DriverMyHirePaymentRow[]>>
  >({});

  const shellInflight = useRef<Promise<DriverMyHireShellRow[] | null> | null>(null);
  const rentalInflight = useRef<Record<string, Promise<DriverMyHireRentalDetails | null>>>({});
  const paymentInflight = useRef<Record<string, Promise<DriverMyHirePaymentRow[] | null>>>({});

  const reloadShell = useCallback(async () => {
    if (shellInflight.current) return shellInflight.current;

    setShell((prev) => ({ ...prev, loading: true, error: null }));
    const promise = loadDriverMyHireShellAction()
      .then((res) => {
        if (!res.ok) {
          setShell({ data: null, loading: false, error: res.error });
          return null;
        }
        setShell({ data: res.rows, loading: false, error: null });
        return res.rows;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Could not load your hire.";
        setShell({ data: null, loading: false, error: message });
        return null;
      })
      .finally(() => {
        shellInflight.current = null;
      });

    shellInflight.current = promise;
    return promise;
  }, []);

  const ensureRentalDetails = useCallback(
    async (hireGroupId: string) => {
      const cached = rentalDetails[hireGroupId];
      if (cached?.data) return cached.data;
      if (hireGroupId in rentalInflight.current) return rentalInflight.current[hireGroupId]!;

      setRentalDetails((prev) => ({
        ...prev,
        [hireGroupId]: { ...(prev[hireGroupId] ?? emptySection()), loading: true, error: null },
      }));

      const promise = loadDriverMyHireRentalDetailsAction(hireGroupId)
        .then((res) => {
          if (!res.ok) {
            setRentalDetails((prev) => ({
              ...prev,
              [hireGroupId]: { data: null, loading: false, error: res.error },
            }));
            return null;
          }
          setRentalDetails((prev) => ({
            ...prev,
            [hireGroupId]: { data: res.details, loading: false, error: null },
          }));
          return res.details;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Could not load rental details.";
          setRentalDetails((prev) => ({
            ...prev,
            [hireGroupId]: { data: null, loading: false, error: message },
          }));
          return null;
        })
        .finally(() => {
          delete rentalInflight.current[hireGroupId];
        });

      rentalInflight.current[hireGroupId] = promise;
      return promise;
    },
    [rentalDetails],
  );

  const ensurePaymentSchedule = useCallback(
    async (hireGroupId: string) => {
      const cached = paymentSchedule[hireGroupId];
      if (cached?.data) return cached.data;
      if (hireGroupId in paymentInflight.current) return paymentInflight.current[hireGroupId]!;

      setPaymentSchedule((prev) => ({
        ...prev,
        [hireGroupId]: { ...(prev[hireGroupId] ?? emptySection()), loading: true, error: null },
      }));

      const promise = loadDriverMyHirePaymentScheduleAction(hireGroupId)
        .then((res) => {
          if (!res.ok) {
            setPaymentSchedule((prev) => ({
              ...prev,
              [hireGroupId]: { data: null, loading: false, error: res.error },
            }));
            return null;
          }
          setPaymentSchedule((prev) => ({
            ...prev,
            [hireGroupId]: { data: res.rows, loading: false, error: null },
          }));
          return res.rows;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Could not load payment schedule.";
          setPaymentSchedule((prev) => ({
            ...prev,
            [hireGroupId]: { data: null, loading: false, error: message },
          }));
          return null;
        })
        .finally(() => {
          delete paymentInflight.current[hireGroupId];
        });

      paymentInflight.current[hireGroupId] = promise;
      return promise;
    },
    [paymentSchedule],
  );

  const value = useMemo(
    () => ({
      shell,
      reloadShell,
      rentalDetails,
      paymentSchedule,
      ensureRentalDetails,
      ensurePaymentSchedule,
    }),
    [shell, reloadShell, rentalDetails, paymentSchedule, ensureRentalDetails, ensurePaymentSchedule],
  );

  return <DriverMyHireContext.Provider value={value}>{children}</DriverMyHireContext.Provider>;
}

export function useDriverMyHire() {
  const ctx = useContext(DriverMyHireContext);
  if (!ctx) throw new Error("useDriverMyHire must be used within DriverMyHireProvider");
  return ctx;
}
