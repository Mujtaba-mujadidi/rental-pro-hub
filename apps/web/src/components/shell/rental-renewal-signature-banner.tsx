import { RentalRenewalSigningActions } from "@/app/(main)/rental/rental-renewal-signing-actions";

export function RentalRenewalSignatureBanner({
  signReady,
  signBlockedReason,
}: {
  signReady: boolean;
  signBlockedReason: string | null;
}) {
  return (
    <div
      className="mb-3 w-full rounded-xl border border-amber-300/90 bg-amber-50 px-4 py-3 dark:border-amber-800/80 dark:bg-amber-950/50"
      role="status"
    >
      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
        Renewal contract signature required
      </p>
      <p className="mt-1 text-sm text-amber-950/90 dark:text-amber-100/90">
        Your legal detail change was approved. Sign the updated platform agreement to complete the amendment.
        Your dashboard stays available until this is signed.
      </p>
      <div className="mt-3">
        <RentalRenewalSigningActions signReady={signReady} signBlockedReason={signBlockedReason} />
      </div>
    </div>
  );
}
