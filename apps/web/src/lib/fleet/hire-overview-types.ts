export type HireOverviewContext = {
  hireGroupId: string;
  hireGroupIdShort: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  driverName: string | null;
  driverEmail: string | null;
  companyName: string | null;
  rentLabel: string | null;
  rentCadence: "daily" | "weekly" | "monthly";
  depositLabel: string | null;
  /** Agreed contract start (`start_date` + time). */
  contractStartLabel: string;
  /** Calendar `start_date` (YYYY-MM-DD) for hire-period ranges. */
  startDateYmd: string;
  /**
   * Actual checkout / go-live when activated; otherwise "Not yet activated".
   * Prefer {@link contractStartLabel} for the contractual hire start.
   */
  startAtLabel: string;
  scheduledEndAtLabel: string | null;
  endedAtLabel: string | null;
  frequencyPositionLabel: string;
  statusLabel: string;
  contractEnded: boolean;
};
