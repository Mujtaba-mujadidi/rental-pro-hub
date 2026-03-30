import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./ui";

export default async function SetPasswordAfterRecoveryPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("rph_pw_recovery")?.value !== "1") {
    redirect(
      `/login?error=${encodeURIComponent("Open the password reset link from your email first, then set a new password here.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent("Open the password reset link from your email first, then set a new password here.")}`,
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Set a new password</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose a password at least 8 characters. You will be signed in after saving.
        </p>
      </div>
      <SetPasswordForm />
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-rph-rail underline decoration-rph-rail/35 hover:text-rph-rail-hover">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
