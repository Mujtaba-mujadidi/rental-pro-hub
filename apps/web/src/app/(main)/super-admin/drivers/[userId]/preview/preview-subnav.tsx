"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const pill =
  "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors";
const idle =
  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const active =
  "border-sky-500 bg-sky-50 text-sky-950 dark:border-sky-600 dark:bg-sky-950/50 dark:text-sky-100";

export function DriverPreviewSubNav({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const dash = basePath;
  const licences = `${basePath}/licences`;
  const profile = `${basePath}/profile`;

  return (
    <nav aria-label="Driver preview sections" className="flex flex-wrap gap-2">
      <Link href={dash} className={[pill, pathname === dash ? active : idle].join(" ")}>
        Dashboard
      </Link>
      <Link href={licences} className={[pill, pathname === licences ? active : idle].join(" ")}>
        Licences &amp; documents
      </Link>
      <Link
        href={profile}
        className={[pill, pathname === profile || pathname.startsWith(`${profile}/`) ? active : idle].join(" ")}
      >
        Profile
      </Link>
    </nav>
  );
}
