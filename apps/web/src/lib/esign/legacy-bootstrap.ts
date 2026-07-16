/**
 * When true, new companies get legacy “already signed” contract rows (no e-sign).
 * Default: false (native RMS e-sign).
 */
export function useLegacyBootstrapContractSigning(): boolean {
  const legacy = process.env.RENTAL_CONTRACT_LEGACY_BOOTSTRAP_SIGNED?.trim().toLowerCase();
  if (legacy === "true" || legacy === "1") return true;
  if (legacy === "false" || legacy === "0") return false;
  return false;
}
