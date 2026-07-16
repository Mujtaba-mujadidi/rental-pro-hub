import Link from "next/link";
import { APP_NAME } from "@rph/shared";

/** Auth screens: light appearance via root `ThemeProvider` `forcedTheme` on /login and /signup only. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-400/15 bg-rph-rail px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 outline-none ring-rph-rail-softer/50 focus-visible:ring-2"
        >
          <span className="text-lg leading-none text-red-500" aria-hidden>
            ■
          </span>
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">{APP_NAME}</span>
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-12">
        <div className="w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
