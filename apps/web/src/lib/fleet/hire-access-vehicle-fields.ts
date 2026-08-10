/** Vehicle columns included in hire access previews (specs only — no compliance/maintenance or internal notes). */
export const HIRE_ACCESS_VEHICLE_SELECT =
  "subcompany_id, vrm, make, model, colour, first_reg_date, first_reg_uk_date, fuel_type, seats, cc";

export type HireAccessVehicleSnapshot = {
  subcompany_id?: string | null;
  vrm?: string | null;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  first_reg_date?: string | null;
  first_reg_uk_date?: string | null;
  fuel_type?: string | null;
  seats?: number | null;
  cc?: number | null;
};
