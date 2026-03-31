import Link from "next/link";
import { LoginForm } from "./ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; next?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use the email and password you registered with.
        </p>
      </div>
      <LoginForm
        registered={Boolean(sp.registered)}
        nextPath={sp.next}
        configError={sp.error === "config"}
        serverError={sp.error && sp.error !== "config" ? sp.error : undefined}
      />
      <p className="text-center text-sm text-slate-500">
        <Link
          href="/signup"
          className="font-medium text-rph-rail underline decoration-rph-rail/35 hover:text-rph-rail-hover"
        >
          Click here
        </Link>{" "}
        to create your driver account
      </p>
    </div>
  );
}
