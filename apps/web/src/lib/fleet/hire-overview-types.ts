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
  startAtLabel: string;
  scheduledEndAtLabel: string | null;
  endedAtLabel: string | null;
  frequencyPositionLabel: string;
  statusLabel: string;
  contractEnded: boolean;
};
