/** Client-safe types and helpers for the super-admin driver list. No server-only imports. */

export type AdminDriverListRow = {
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  town: string;
  postcode: string;
  registeredAt: string;
  /** When set and in the future, the auth user cannot sign in. */
  bannedUntil: string | null;
};

function isAuthBanActive(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const t = new Date(bannedUntil).getTime();
  return Number.isFinite(t) && t > Date.now();
}

export function driverIsBlocked(row: Pick<AdminDriverListRow, "bannedUntil">): boolean {
  return isAuthBanActive(row.bannedUntil);
}
