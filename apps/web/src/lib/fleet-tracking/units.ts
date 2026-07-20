/** Track API mileage fields are metres; report API is km; UK UI is miles. */

const METRES_PER_MILE = 1609.344;
const KM_PER_MILE = 1.609344;

export function metresToMiles(metres: number): number {
  if (!Number.isFinite(metres) || metres < 0) return 0;
  return metres / METRES_PER_MILE;
}

export function milesToMetres(miles: number): number {
  if (!Number.isFinite(miles) || miles < 0) return 0;
  return miles * METRES_PER_MILE;
}

export function kmToMiles(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  return km / KM_PER_MILE;
}

export function milesToKm(miles: number): number {
  if (!Number.isFinite(miles) || miles < 0) return 0;
  return miles * KM_PER_MILE;
}

/**
 * SET_MILEAGE paramData uses km (API 2.5 example {"mileage":"30"}; device manuals quote km, max ~999,999).
 * Live track odometer is still reported in metres — different register scale on the wire.
 */
export function milesToSetMileageKmString(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return "0";
  return String(Math.round(milesToKm(Math.ceil(miles))));
}

/** Compare live track odometer (metres) to an expected miles reading. */
export function trackOdometerMatchesMiles(
  metres: number | null | undefined,
  expectedMiles: number,
  toleranceMiles = 3,
): boolean {
  if (metres == null || metres < 0 || !Number.isFinite(expectedMiles)) return false;
  return Math.abs(metresToMiles(metres) - expectedMiles) <= toleranceMiles;
}

export function kmhToMph(kmh: number): number {
  if (!Number.isFinite(kmh) || kmh < 0) return 0;
  return kmh / KM_PER_MILE;
}

export function formatMiles(value: number, digits = 0): string {
  return value.toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}
