/** Pure vehicle profit & loss from capital events and operating costs. */

export type VehiclePnlInput = {
  purchaseGbp: number | null;
  saleGbp: number | null;
  maintenanceTotalGbp: number;
  rentalIncomeGbp?: number | null;
  pcnTotalGbp?: number | null;
  claimsNetGbp?: number | null;
};

export type VehiclePnlBreakdown = {
  purchaseGbp: number | null;
  saleGbp: number | null;
  capitalGainGbp: number | null;
  maintenanceTotalGbp: number;
  rentalIncomeGbp: number;
  pcnTotalGbp: number;
  claimsNetGbp: number;
  operatingCostGbp: number;
  /** sale − purchase − operating costs; null when not sold yet */
  netPnlGbp: number | null;
  /** purchase + operating costs while still owned */
  bookPositionGbp: number | null;
  isSold: boolean;
  hasPurchase: boolean;
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function nz(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return v;
}

/**
 * Compute vehicle-level P&L.
 * Capital gain is only realised on sale. Operating costs always reduce net position.
 */
export function computeVehiclePnl(input: VehiclePnlInput): VehiclePnlBreakdown {
  const purchaseGbp = input.purchaseGbp != null && Number.isFinite(input.purchaseGbp) ? roundGbp(input.purchaseGbp) : null;
  const saleGbp = input.saleGbp != null && Number.isFinite(input.saleGbp) ? roundGbp(input.saleGbp) : null;
  const maintenanceTotalGbp = roundGbp(Math.max(0, nz(input.maintenanceTotalGbp)));
  const rentalIncomeGbp = roundGbp(Math.max(0, nz(input.rentalIncomeGbp)));
  const pcnTotalGbp = roundGbp(Math.max(0, nz(input.pcnTotalGbp)));
  const claimsNetGbp = roundGbp(nz(input.claimsNetGbp));

  const operatingCostGbp = roundGbp(maintenanceTotalGbp + pcnTotalGbp - claimsNetGbp);
  const isSold = saleGbp != null;
  const hasPurchase = purchaseGbp != null;

  let capitalGainGbp: number | null = null;
  if (isSold) {
    capitalGainGbp = roundGbp(saleGbp - (purchaseGbp ?? 0));
  }

  let netPnlGbp: number | null = null;
  if (isSold) {
    netPnlGbp = roundGbp((saleGbp ?? 0) - (purchaseGbp ?? 0) - operatingCostGbp + rentalIncomeGbp);
  }

  let bookPositionGbp: number | null = null;
  if (!isSold && hasPurchase) {
    bookPositionGbp = roundGbp((purchaseGbp ?? 0) + operatingCostGbp - rentalIncomeGbp);
  }

  return {
    purchaseGbp,
    saleGbp,
    capitalGainGbp,
    maintenanceTotalGbp,
    rentalIncomeGbp,
    pcnTotalGbp,
    claimsNetGbp,
    operatingCostGbp,
    netPnlGbp,
    bookPositionGbp,
    isSold,
    hasPurchase,
  };
}
