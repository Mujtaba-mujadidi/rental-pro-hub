import Link from "next/link";
import { APP_NAME } from "@rph/shared";
import { SignOutForm } from "@/components/sign-out-form";
import { requireProfile } from "@/lib/auth/profile";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireProfile();

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-semibold text-zinc-900">
              {APP_NAME}
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-600">
              <Link href="/dashboard" className="hover:text-zinc-900">
                Dashboard
              </Link>
              {profile.user_type === "company_staff" ? (
                <Link href="/company/subcompanies" className="hover:text-zinc-900">
                  Subcompanies
                </Link>
              ) : null}
              {profile.user_type === "platform_admin" ? (
                <Link href="/admin/companies" className="hover:text-zinc-900">
                  Admin
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {profile.display_name ?? profile.id.slice(0, 8)} · {profile.user_type}
            </span>
            <SignOutForm />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
