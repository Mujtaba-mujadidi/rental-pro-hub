/** Columns needed to decide if driver onboarding is finished. */
export const DRIVER_ONBOARDING_COLUMNS =
  "driving_licence_number, driving_licence_expiry, phv_licence_number, phv_licensing_authority, phv_licence_expiry, driving_licence_front_path, driving_licence_back_path, phv_licence_card_path, licence_revalidation_due_at" as const;

export type DriverOnboardingRow = {
  driving_licence_number: string | null;
  driving_licence_expiry: string | null;
  phv_licence_number: string | null;
  phv_licensing_authority: string | null;
  phv_licence_expiry: string | null;
  driving_licence_front_path: string | null;
  driving_licence_back_path: string | null;
  phv_licence_card_path: string | null;
  licence_revalidation_due_at: string | null;
} | null;

/** Address fields for dashboard updates (separate select fragment). */
export const DRIVER_ADDRESS_COLUMNS =
  "address_line1, address_line2, address_town, address_county, address_postcode" as const;

/** Driving licence step: number, expiry, and both photos. */
export function driverDrivingLicenceStepComplete(row: NonNullable<DriverOnboardingRow>): boolean {
  return (
    Boolean(row.driving_licence_number?.trim()) &&
    Boolean(row.driving_licence_expiry) &&
    Boolean(row.driving_licence_front_path?.trim()) &&
    Boolean(row.driving_licence_back_path?.trim())
  );
}

/** True when licence details and all three document images are stored. */
export function driverOnboardingComplete(row: DriverOnboardingRow): boolean {
  if (!row) return false;
  return (
    driverDrivingLicenceStepComplete(row) &&
    Boolean(row.phv_licence_number?.trim()) &&
    Boolean(row.phv_licensing_authority?.trim()) &&
    Boolean(row.phv_licence_expiry) &&
    Boolean(row.phv_licence_card_path?.trim())
  );
}
