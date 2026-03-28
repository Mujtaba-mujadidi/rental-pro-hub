import Link from "next/link";
import { APP_NAME } from "@rph/shared";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-zinc-500">{APP_NAME}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
          Rental management for PHV operators
        </h1>
        <p className="mt-3 text-zinc-600">
          Sign in to manage companies, subcompanies, and drivers. Phase 1 covers
          authentication and tenancy.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
