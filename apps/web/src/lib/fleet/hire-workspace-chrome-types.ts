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
  statusLabel: string;
  contractEnded: boolean;
  amountDueChip: string | null;
  driverName: string | null;
  activeSinceLabel: string;
  contractEndLabel: string | null;
  dailyRentLabel: string | null;
  rentMetricLabel: string;
  frequencyHint: string | null;
  canTerminate: boolean;
  includeDeposit: boolean;
  checkout: HireWorkspaceCheckoutGlance | null;
};
