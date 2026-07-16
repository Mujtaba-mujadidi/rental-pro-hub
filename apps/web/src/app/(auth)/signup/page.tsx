import Link from "next/link";
import { SignUpForm } from "./ui";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Driver sign up</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Self-registration is for <strong className="text-zinc-700">drivers</strong> only. Use the four steps below
          (about you, contact, UK address, then password). After you log in you&apos;ll complete licence onboarding
          before the driver home page unlocks. System admins: set{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">SUPER_ADMIN_EMAIL</code> in env or promote{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">profiles.role</code> in SQL.
        </p>
      </div>
      <SignUpForm />
      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-rph-rail underline decoration-rph-rail/35 hover:text-rph-rail-hover"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
