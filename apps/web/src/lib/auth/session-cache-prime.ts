import { getCachedCompanyGate } from "@/lib/auth/company-gate-cache";
import { getCachedProfileBundle } from "@/lib/auth/profile-bundle-cache";

/**
 * Warm profile + company gate caches after login so the first rental page render
 * reuses data already fetched during sign-in redirect resolution.
 */
export async function primeRentalSessionCaches(userId: string): Promise<void> {
  const bundle = await getCachedProfileBundle(userId);
  if (!bundle.row || bundle.row.role !== "rental_company") return;

  const preferred = bundle.row.company_id?.trim() ?? null;
  const activeParent =
    preferred && bundle.memberships.some((m) => m.parent_company_id === preferred)
      ? preferred
      : (bundle.memberships[0]?.parent_company_id ?? null);

  if (activeParent) {
    await getCachedCompanyGate(activeParent);
  }
}
