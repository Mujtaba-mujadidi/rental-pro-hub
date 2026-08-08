import Link from "next/link";
import { getAppProfile, getSessionUser } from "@/lib/auth/profile";
import { getRentalSessionLifecycleCached } from "@/lib/auth/rental-lifecycle";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { RentalDisplayNameSetting } from "./rental-display-name-setting";

export default async function RentalCompanyHomePage() {
  const user = await getSessionUser();
  const profile = await getAppProfile();
  if (!user || !profile) return null;

  const life = await getRentalSessionLifecycleCached(user.id, user.email);
  const companyName = life.kind === "rental" ? life.companyName : null;
  const personalLabel =
    profile.display_name?.trim() || user.email?.split("@")[0]?.trim() || "User";

  return (
    <div className="space-y-4">
      <h1 className="rph-h1">Company dashboard</h1>
      <p className="rph-lead">
        Signed in as <span className="rph-strong">{personalLabel}</span>
        {companyName ? (
          <>
            {" "}
            · <span className="rph-strong">{companyName}</span>
          </>
        ) : null}
      </p>
      <RentalDisplayNameSetting initialName={profile.display_name ?? ""} />
      <p className="rph-muted max-w-2xl text-sm">
        Your account is active. Manage fleet under{" "}
        <Link
          href="/rental/vehicles"
          className="font-medium text-rph-link underline-offset-2 hover:text-rph-link-hover hover:underline"
        >
          Vehicles
        </Link>
        . View your platform agreement or request a legal amendment on the{" "}
        <Link
          href="/rental/contract"
          className="font-medium text-rph-link underline-offset-2 hover:text-rph-link-hover hover:underline"
        >
          {rentalContractCopy.platformAgreementNav}
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
