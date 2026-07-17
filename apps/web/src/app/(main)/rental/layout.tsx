import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth/profile";
import { getRentalSessionLifecycleCached, rentalPathRequiresRedirect } from "@/lib/auth/rental-lifecycle";

const getPathname = cache(async () => {
  const h = await headers();
  return h.get("x-pathname") ?? "/rental";
});

/**
 * Shared rental area gate (once per request). Replaces per-page onboarding redirects
 * and the old middleware lifecycle queries on every navigation.
 */
export default async function RentalAreaLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const life = await getRentalSessionLifecycleCached(user.id, user.email);
  const pathname = await getPathname();
  const target = rentalPathRequiresRedirect(pathname, life);
  if (target && target !== pathname) {
    redirect(target);
  }

  return children;
}
