import Link from "next/link";
import { redirect } from "next/navigation";
import { loadDriverMyHireShellAction } from "@/app/actions/driver-hires";
import { requireDriverArea } from "@/lib/auth/profile";
import { resolveDriverMyHireRedirectPath } from "@/lib/fleet/driver-hire-nav";

export default async function DriverMyHirePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; hire?: string }>;
}) {
  await requireDriverArea();
  const sp = await searchParams;
  const res = await loadDriverMyHireShellAction();

  if (!res.ok) {
    return <p className="rph-alert-error text-sm">{res.error}</p>;
  }

  if (!res.rows.length) {
    return (
      <div className="space-y-2">
        <h1 className="rph-h1">My hire</h1>
        <p className="rph-muted text-sm">
          You do not have an active hire right now. Check{" "}
          <Link href="/driver/hire-requests" className="rph-link-inline">
            Hire requests
          </Link>{" "}
          for contracts waiting to be signed.
        </p>
      </div>
    );
  }

  const preferred = sp.hire?.trim() || null;
  const row =
    (preferred ? res.rows.find((r) => r.hireGroupId === preferred) : null) ?? res.rows[0];

  redirect(resolveDriverMyHireRedirectPath(row.hireGroupId, sp.tab));
}
