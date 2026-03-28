import Link from "next/link";
import { SignUpForm } from "./ui";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Sign up</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create a driver account. Platform admins promote accounts in SQL (see
          README).
        </p>
      </div>
      <SignUpForm />
      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
