import Link from "next/link";
import { APP_NAME } from "@rph/shared";

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-400/15 bg-rph-rail px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="text-lg leading-none text-red-500" aria-hidden>
            ■
          </span>
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/login"
            className="font-medium text-slate-300 transition hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-rph-rail px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rph-rail-hover sm:text-sm dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
          >
            Driver sign up
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-xl border border-slate-200/90 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rph-rail dark:text-rph-rail-softer">
              PHV operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Rental management for operators & drivers
            </h1>
            <p className="mt-3 text-slate-600 dark:text-slate-400">
              Drivers register in four steps, then complete licence onboarding after sign-in. Console
              styling follows the PHVDriveHub / Option 7 reference: navy rail, matching accents, white
              workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-rph-rail px-6 text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Driver sign up
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        © {year} {APP_NAME}
        <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
        <a href="#" className="hover:text-rph-rail dark:hover:text-rph-rail-softer">
          About
        </a>
        <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
        <a href="#" className="hover:text-rph-rail dark:hover:text-rph-rail-softer">
          Contact
        </a>
      </footer>
    </div>
  );
}
