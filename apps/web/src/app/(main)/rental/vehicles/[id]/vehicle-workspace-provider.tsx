"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadVehicleDetailAction } from "@/app/actions/rental-vehicles";
import {
  loadVehicleFinancialsAction,
  type VehicleFinancialsPageData,
} from "@/app/actions/rental-vehicle-financials";
import {
  loadVehicleMaintenancePageAction,
  type VehicleMaintenancePageData,
} from "@/app/actions/rental-maintenance";
import type { VehicleWorkspaceShell } from "@/lib/fleet/load-vehicle-workspace-shell";

type TabCache<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type VehicleWorkspaceContextValue = {
  vehicleId: string;
  shell: VehicleWorkspaceShell;
  financials: TabCache<VehicleFinancialsPageData>;
  maintenance: TabCache<VehicleMaintenancePageData>;
  refreshShell: () => Promise<boolean>;
  ensureFinancials: () => Promise<VehicleFinancialsPageData | null>;
  reloadFinancials: () => Promise<VehicleFinancialsPageData | null>;
  invalidateFinancials: () => void;
  ensureMaintenance: () => Promise<VehicleMaintenancePageData | null>;
  reloadMaintenance: () => Promise<VehicleMaintenancePageData | null>;
  invalidateMaintenance: () => void;
};

const VehicleWorkspaceContext = createContext<VehicleWorkspaceContextValue | null>(null);

function emptyTabCache<T>(): TabCache<T> {
  return { data: null, loading: false, error: null };
}

function shellFromResult(
  result: Awaited<ReturnType<typeof loadVehicleDetailAction>>,
): VehicleWorkspaceShell | null {
  if (!result.ok) return null;
  const { vehicle, documents, transfers, subcompanies, notifySettings, canManage, canDelete } = result;
  return { vehicle, documents, transfers, subcompanies, notifySettings, canManage, canDelete };
}

export function VehicleWorkspaceProvider({
  vehicleId,
  initialShell,
  children,
}: {
  vehicleId: string;
  initialShell: VehicleWorkspaceShell;
  children: ReactNode;
}) {
  const [shell, setShell] = useState(initialShell);
  const [financials, setFinancials] = useState<TabCache<VehicleFinancialsPageData>>(emptyTabCache);
  const [maintenance, setMaintenance] = useState<TabCache<VehicleMaintenancePageData>>(emptyTabCache);

  const financialsInflight = useRef<Promise<VehicleFinancialsPageData | null> | null>(null);
  const maintenanceInflight = useRef<Promise<VehicleMaintenancePageData | null> | null>(null);

  const refreshShell = useCallback(async () => {
    const res = await loadVehicleDetailAction(vehicleId);
    const next = shellFromResult(res);
    if (!next) return false;
    setShell(next);
    return true;
  }, [vehicleId]);

  const loadFinancials = useCallback(
    async (force: boolean) => {
      if (financials.data && !force) return financials.data;
      if (financialsInflight.current && !force) return financialsInflight.current;

      setFinancials((prev) => ({ ...prev, loading: true, error: null }));
      const promise = loadVehicleFinancialsAction(vehicleId)
        .then((res) => {
          if (!res.ok) {
            setFinancials({ data: null, loading: false, error: res.error });
            return null;
          }
          setFinancials({ data: res.data, loading: false, error: null });
          return res.data;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Could not load financials.";
          setFinancials({ data: null, loading: false, error: message });
          return null;
        })
        .finally(() => {
          financialsInflight.current = null;
        });

      financialsInflight.current = promise;
      return promise;
    },
    [vehicleId, financials.data],
  );

  const loadMaintenance = useCallback(
    async (force: boolean) => {
      if (maintenance.data && !force) return maintenance.data;
      if (maintenanceInflight.current && !force) return maintenanceInflight.current;

      setMaintenance((prev) => ({ ...prev, loading: true, error: null }));
      const promise = loadVehicleMaintenancePageAction(vehicleId)
        .then((res) => {
          if (!res.ok) {
            setMaintenance({ data: null, loading: false, error: res.error });
            return null;
          }
          setMaintenance({ data: res.data, loading: false, error: null });
          return res.data;
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Could not load maintenance.";
          setMaintenance({ data: null, loading: false, error: message });
          return null;
        })
        .finally(() => {
          maintenanceInflight.current = null;
        });

      maintenanceInflight.current = promise;
      return promise;
    },
    [vehicleId, maintenance.data],
  );

  const value = useMemo<VehicleWorkspaceContextValue>(
    () => ({
      vehicleId,
      shell,
      financials,
      maintenance,
      refreshShell,
      ensureFinancials: () => loadFinancials(false),
      reloadFinancials: () => loadFinancials(true),
      invalidateFinancials: () => {
        financialsInflight.current = null;
        setFinancials(emptyTabCache());
      },
      ensureMaintenance: () => loadMaintenance(false),
      reloadMaintenance: () => loadMaintenance(true),
      invalidateMaintenance: () => {
        maintenanceInflight.current = null;
        setMaintenance(emptyTabCache());
      },
    }),
    [vehicleId, shell, financials, maintenance, refreshShell, loadFinancials, loadMaintenance],
  );

  return <VehicleWorkspaceContext.Provider value={value}>{children}</VehicleWorkspaceContext.Provider>;
}

export function useVehicleWorkspace() {
  const context = useContext(VehicleWorkspaceContext);
  if (!context) {
    throw new Error("useVehicleWorkspace must be used within VehicleWorkspaceProvider.");
  }
  return context;
}
