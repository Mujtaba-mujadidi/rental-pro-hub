/** Defaults for rental company expiry notification lead times (days before expiry). */

export const DEFAULT_NOTIFY_MOT_DAYS = 5;
export const DEFAULT_NOTIFY_TAX_DAYS = 5;
export const DEFAULT_NOTIFY_PHV_LICENCE_DAYS = 28;

export type CompanyNotificationSettings = {
  notify_mot_days_before: number;
  notify_tax_days_before: number;
  notify_phv_licence_days_before: number;
};

export function defaultNotificationSettings(): CompanyNotificationSettings {
  return {
    notify_mot_days_before: DEFAULT_NOTIFY_MOT_DAYS,
    notify_tax_days_before: DEFAULT_NOTIFY_TAX_DAYS,
    notify_phv_licence_days_before: DEFAULT_NOTIFY_PHV_LICENCE_DAYS,
  };
}

export function clampNotifyDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(365, Math.max(0, Math.round(value)));
}
