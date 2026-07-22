import { HireBundleSignClient } from "@/components/esign/hire-bundle-sign-client";

export default async function HireBundleSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token?.trim()) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Link invalid</h1>
        <p className="mt-2 text-sm text-slate-600">This signing link is not valid.</p>
      </div>
    );
  }

  return <HireBundleSignClient token={token.trim()} />;
}
