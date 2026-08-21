export type HireWorkspaceCheckoutGlance = {
  odometerMiles: number | null;
  fuelLevelPercent: number | null;
  completedAtLabel: string | null;
};

export type HireWorkspaceChromeData = {
  hireGroupId: string;
  hireGroupIdShort: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  lessorName: string;
  companyName: string | null;
  statusLabel: string;
  contractEnded: boolean;
  amountDueChip: string | null;
  driverName: string | null;
  /** Agreed contract start (`start_date` + time). */
  contractStartLabel: string;
  /** Actual checkout / go-live (`activated_at`), or not-yet label. */
  activeSinceLabel: string;
  contractEndLabel: string | null;
  dailyRentLabel: string | null;
  rentMetricLabel: string;
  frequencyHint: string | null;
  frequencyPositionLabel: string | null;
  endedHirePeriodLabel: string | null;
  endedTimeOnHireLabel: string | null;
  settlementStatusChip: string | null;
  canTerminate: boolean;
  /** Terminated, checkout done, check-in not completed — show Check in next to End contract. */
  canCheckIn: boolean;
  includeDeposit: boolean;
  checkout: HireWorkspaceCheckoutGlance | null;
};
