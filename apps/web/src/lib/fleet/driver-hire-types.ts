import type { HireAccessDisplay } from "@/lib/fleet/hire-access-display";

export type DriverMyHireShellRow = {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  companyName: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  startDateLabel: string;
  rentLabel: string | null;
  activatedAtLabel: string | null;
};

export type DriverMyHireRentalDetails = HireAccessDisplay & {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  agreementLines: string[];
};

export type DriverMyHirePaymentRow = {
  id: string;
  periodStartLabel: string;
  periodEndLabel: string;
  amountLabel: string;
  rowKind: string;
  paymentStatus: string;
  paymentStatusLabel: string;
};

export type DriverHireHistoryRow = {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  companyName: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  startDateLabel: string;
  endDateLabel: string | null;
  terminatedAtLabel: string | null;
  signedAgreementCount: number;
};

export type DriverHireWorkspaceShell = {
  hireGroupId: string;
  status: string;
  statusLabel: string;
  companyName: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  startDateLabel: string;
  rentLabel: string | null;
  terminatedAtLabel: string | null;
};
