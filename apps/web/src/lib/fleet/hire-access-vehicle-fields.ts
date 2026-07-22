/** Vehicle columns included in hire access previews (specs only — no compliance/maintenance). */
export const HIRE_ACCESS_VEHICLE_SELECT =
  "vrm, make, model, colour, first_reg_date, first_reg_uk_date, fuel_type, seats, cc, notes";

export type HireAccessVehicleSnapshot = {
  vrm?: string | null;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  first_reg_date?: string | null;
  first_reg_uk_date?: string | null;
  fuel_type?: string | null;
  seats?: number | null;
  cc?: number | null;
  notes?: string | null;
};
