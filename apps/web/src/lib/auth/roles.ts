/** Server-only: set SUPER_ADMIN_EMAIL in .env.local to the system admin’s login email. */
export function isSuperAdminEmail(email: string | undefined | null): boolean {
  const configured = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configured || !email) return false;
  return email.trim().toLowerCase() === configured;
}

export function isSuperAdmin(
  email: string | undefined | null,
  profile: { role: string } | null,
): boolean {
  if (isSuperAdminEmail(email)) return true;
  return profile?.role === "super_admin";
}
