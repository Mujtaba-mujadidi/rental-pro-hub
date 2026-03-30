import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { loadDriverPreviewBundle } from "@/lib/admin/load-driver-preview";
import { DriverPreviewSubNav } from "./preview-subnav";

export default async function AdminDriverPreviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ userId: string }>;
}) {
  await requireSuperAdmin();
  const { userId } = await params;
  const bundle = await loadDriverPreviewBundle(userId);
  if (!bundle) notFound();

  const basePath = `/super-admin/drivers/${bundle.userId}/preview`;
  const who = bundle.displayName?.trim() || bundle.email || bundle.userId.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
        <p>
          <span className="font-semibold">Admin preview</span>
          {" · "}read-only · <span className="font-medium">{who}</span>
        </p>
        <p className="mt-2 text-xs text-sky-900/85 dark:text-sky-100/85">
          Same screens as the driver app (dashboard, licences with photos, profile). You stay signed in as super admin.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DriverPreviewSubNav basePath={basePath} />
          <Link
            href="/super-admin/drivers"
            className="shrink-0 text-sm font-medium text-sky-900 underline decoration-sky-800/30 hover:decoration-sky-900 dark:text-sky-100 dark:decoration-sky-200/30"
          >
            ← All drivers
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
