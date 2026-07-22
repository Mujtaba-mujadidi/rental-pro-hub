import Link from "next/link";
import { APP_NAME } from "@rph/shared";
import { getSessionUser } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

/** Public pages (hire access links from email) — no signed-in shell required. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  let pendingHireRequests = 0;
  if (user) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("company_driver_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("driver_user_id", user.id)
      .eq("status", "pending");
    pendingHireRequests = count ?? 0;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-rph-page">
      <header className="rph-chrome flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-rph-rail/40"
        >
          <span className="text-lg leading-none text-rph-rail" aria-hidden>
            ■
          </span>
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-rph-fg">{APP_NAME}</span>
        </Link>
        {user ? (
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/driver" className="text-rph-fg-secondary hover:text-rph-fg">
              Driver area
            </Link>
            <Link href="/driver/hire-requests" className="inline-flex items-center gap-2 text-rph-link hover:text-rph-link-hover">
              Hire requests
              {pendingHireRequests > 0 ? (
                <span className="rounded-full bg-rph-rail px-2 py-0.5 text-xs font-semibold text-white">
                  {pendingHireRequests}
                </span>
              ) : null}
            </Link>
          </nav>
        ) : null}
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <div className="rph-card flex-1 p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
