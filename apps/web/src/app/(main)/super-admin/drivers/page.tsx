import { requireSuperAdmin } from "@/lib/auth/profile";
import { AdminDriversTable } from "./admin-drivers-table";

export default async function SuperAdminDriversPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">Registered drivers</h1>
        <p className="rph-muted mt-1 text-sm">
          Browse driver accounts with search, filters, and paging (server-side). Use{" "}
          <span className="font-medium">View</span> for a read-only preview in a new tab; reset password, block, or
          set active from the row menu (⋮).
        </p>
      </div>

      <AdminDriversTable />
    </div>
  );
}
