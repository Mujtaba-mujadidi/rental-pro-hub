import { requireSuperAdmin } from "@/lib/auth/profile";

export default async function SuperAdminHomePage() {
  const { profile } = await requireSuperAdmin();

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Dashboard</h1>
      <p className="rph-lead">
        Signed in as <span className="rph-strong">{profile.display_name ?? "Admin"}</span>.
      </p>
      <p className="rph-muted text-sm">Hello super admin — more tools can be added here.</p>
    </div>
  );
}
