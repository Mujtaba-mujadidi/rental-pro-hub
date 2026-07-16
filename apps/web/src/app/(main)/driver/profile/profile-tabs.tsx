"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateDriverAddressAction } from "@/app/actions/driver-address";
import {
  changeDriverPasswordAction,
  updateDriverPhoneAction,
  type DriverProfileActionResult,
} from "@/app/actions/driver-profile";
import { formatLicenceDate } from "@/lib/driver/licence-display";

const TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "contact" as const, label: "Contact" },
  { id: "address" as const, label: "Address" },
  { id: "security" as const, label: "Security" },
  { id: "licences" as const, label: "Licences" },
];

type TabId = (typeof TABS)[number]["id"];

const tabIds = new Set<string>(TABS.map((t) => t.id));

function normalizeTab(t: string | undefined): TabId {
  if (t && tabIds.has(t)) return t as TabId;
  return "overview";
}

const initial: DriverProfileActionResult = {};

const tabBtn =
  "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
const tabActive =
  "border-orange-500 bg-orange-50 text-orange-800 dark:border-orange-600 dark:bg-orange-950/35 dark:text-orange-200";
const tabIdle =
  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rph-btn-primary-wide mt-2 w-full sm:mt-0 sm:w-auto">
      {pending ? "Saving…" : label}
    </button>
  );
}

export type DriverProfilePreviousAddress = {
  line1: string;
  line2: string | null;
  town: string;
  county: string | null;
  postcode: string;
  effectiveTo: string | null;
};

export type DriverProfileTabsData = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  address_town: string;
  address_county: string | null;
  address_postcode: string;
  hasPendingAddress: boolean;
  pendingFormatted: string;
  driving_licence_number: string | null;
  driving_licence_expiry: string | null;
  phv_licence_number: string | null;
  phv_licensing_authority: string | null;
  phv_licence_expiry: string | null;
  drivingPhotosOnFile: boolean;
  phvPhotoOnFile: boolean;
};

export type DriverProfileLabels = {
  memberSince: string;
  profileUpdated: string;
  addressConfirmed: string;
};

export function DriverProfileTabs({
  defaultTab,
  labels,
  user,
  profile,
  driver,
  previousAddress,
  readOnly = false,
  previewFullLicencesHref,
}: {
  defaultTab?: string;
  labels: DriverProfileLabels;
  user: { email: string | null };
  profile: { display_name: string | null };
  driver: DriverProfileTabsData;
  previousAddress: DriverProfilePreviousAddress | null;
  /** When true (super-admin preview), forms are hidden and the session stays the admin user. */
  readOnly?: boolean;
  /** Super-admin preview: link to full licences page with document photos. */
  previewFullLicencesHref?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(() => normalizeTab(defaultTab));
  const tablistId = useId();

  useEffect(() => {
    setTab(normalizeTab(defaultTab));
  }, [defaultTab]);

  const [phoneState, phoneAction] = useActionState(updateDriverPhoneAction, initial);
  const [addressState, addressAction] = useActionState(updateDriverAddressAction, initial);
  const [passwordState, passwordAction] = useActionState(changeDriverPasswordAction, initial);

  useEffect(() => {
    if (!phoneState.ok) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }, [phoneState.ok, router]);
  useEffect(() => {
    if (!addressState.ok) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }, [addressState.ok, router]);
  useEffect(() => {
    if (!passwordState.ok) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }, [passwordState.ok, router]);

  const dobLabel = formatLicenceDate(driver.date_of_birth);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">{readOnly ? "Driver profile" : "Your profile"}</h1>
        <p className="rph-muted mt-1 text-sm">
          {readOnly ? (
            <>
              Read-only preview as seen in the driver app. Licence numbers and photos are summarized on the{" "}
              <button
                type="button"
                role="tab"
                className="font-medium text-rph-rail underline decoration-rph-rail/30 hover:decoration-rph-rail dark:text-rph-rail-softer"
                onClick={() => setTab("licences")}
              >
                Licences
              </button>{" "}
              tab.
            </>
          ) : (
            <>
              View your details and update your phone, home address, or password. Licence numbers and photos are
              managed on{" "}
              <Link href="/driver/onboarding" className="rph-link-inline">
                Licences
              </Link>
              .
            </>
          )}
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-700"
        role="tablist"
        aria-label="Profile sections"
        id={tablistId}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={[tabBtn, tab === t.id ? tabActive : tabIdle].join(" ")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-6" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Account</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Display name" value={profile.display_name?.trim() || "—"} />
              <Row label="Email" value={user.email ?? "—"} />
              <Row label="Member since" value={labels.memberSince} />
            </dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Personal</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="First name" value={driver.first_name?.trim() || "—"} />
              <Row label="Last name" value={driver.last_name?.trim() || "—"} />
              <Row label="Date of birth" value={dobLabel} />
              <Row label="Phone" value={driver.phone?.trim() || "—"} />
            </dl>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Name and date of birth were set at registration. To change them, contact support.
            </p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Home address</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Line 1" value={driver.address_line1} />
              {driver.address_line2?.trim() ? (
                <Row label="Line 2" value={driver.address_line2} />
              ) : null}
              <Row label="Town" value={driver.address_town} />
              {driver.address_county?.trim() ? (
                <Row label="County" value={driver.address_county} />
              ) : null}
              <Row label="Postcode" value={driver.address_postcode} />
              <Row label="Last confirmed" value={labels.addressConfirmed} />
            </dl>
            {driver.hasPendingAddress ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/35">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">
                  New address (pending)
                </p>
                <p className="mt-1 text-sm font-medium text-amber-950 dark:text-amber-50">
                  {driver.pendingFormatted}
                </p>
              </div>
            ) : null}
          </section>
          <p className="text-xs text-slate-500 dark:text-slate-400">Profile last updated {labels.profileUpdated}.</p>
        </div>
      ) : null}

      {tab === "contact" ? (
        <div className="space-y-4" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Phone number</h2>
            {readOnly ? (
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="Phone" value={driver.phone?.trim() || "—"} />
              </dl>
            ) : (
              <>
                <p className="rph-muted mt-1 text-sm">
                  We use this to reach you about your account. Your sign-in email stays the same.
                </p>
                <form action={phoneAction} className="mt-4 max-w-md space-y-4">
              {phoneState.error ? <p className="rph-alert-error">{phoneState.error}</p> : null}
              {phoneState.ok ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
                  Phone number saved.
                </p>
              ) : null}
              <div className="space-y-1">
                <label htmlFor="profile_phone" className="rph-label-lg">
                  Mobile or landline
                </label>
                <input
                  id="profile_phone"
                  name="phone"
                  type="tel"
                  required
                  defaultValue={driver.phone}
                  autoComplete="tel"
                  className="rph-input-auth"
                />
              </div>
              <Submit label="Save phone number" />
                </form>
              </>
            )}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Email</h2>
            <p className="rph-muted mt-1 text-sm">
              {readOnly ? (
                <>
                  Sign-in email:{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">{user.email ?? "—"}</span>
                </>
              ) : (
                <>
                  Your email is{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">{user.email ?? "—"}</span>.
                  To change it, contact support (email updates are not available in the app yet).
                </>
              )}
            </p>
          </section>
        </div>
      ) : null}

      {tab === "address" ? (
        <div className="space-y-4" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Home address</h2>
            {!readOnly ? (
              <p className="rph-muted mt-1 max-w-xl text-sm">
                If you change your address, we store the new one as pending until your updated driving licence
                photos are submitted on the Licences page.
              </p>
            ) : null}
            {previousAddress ? (
              <div className="mt-4 max-w-xl rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Previous address</p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  {[
                    previousAddress.line1,
                    previousAddress.line2,
                    previousAddress.town,
                    previousAddress.county,
                    previousAddress.postcode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {previousAddress.effectiveTo ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Until {formatLicenceDate(previousAddress.effectiveTo)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {driver.hasPendingAddress ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/35">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200/90">
                  Pending new address
                </p>
                <p className="mt-1 text-sm font-medium text-amber-950 dark:text-amber-50">
                  {driver.pendingFormatted}
                </p>
                <p className="mt-1 text-xs text-amber-900/85 dark:text-amber-100/85">
                  {readOnly ? (
                    "The driver completes activation on Licences in their account."
                  ) : (
                    <>
                      Complete steps on{" "}
                      <Link href="/driver/onboarding" className="font-semibold underline">
                        Licences
                      </Link>{" "}
                      to activate it.
                    </>
                  )}
                </p>
              </div>
            ) : null}
            {readOnly ? (
              <dl className="mt-4 max-w-xl space-y-3 text-sm">
                <Row label="Line 1" value={driver.address_line1} />
                {driver.address_line2?.trim() ? (
                  <Row label="Line 2" value={driver.address_line2} />
                ) : null}
                <Row label="Town" value={driver.address_town} />
                {driver.address_county?.trim() ? (
                  <Row label="County" value={driver.address_county} />
                ) : null}
                <Row label="Postcode" value={driver.address_postcode} />
              </dl>
            ) : (
              <form action={addressAction} className="mt-4 max-w-xl space-y-4">
              {addressState.error ? <p className="rph-alert-error">{addressState.error}</p> : null}
              {addressState.ok ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
                  Address saved.
                </p>
              ) : null}
              <div className="space-y-1">
                <label htmlFor="profile_address_line1" className="rph-label-lg">
                  Address line 1
                </label>
                <input
                  id="profile_address_line1"
                  name="address_line1"
                  required
                  defaultValue={driver.address_line1}
                  autoComplete="street-address"
                  className="rph-input-auth"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="profile_address_line2" className="rph-label-lg">
                  Address line 2 (optional)
                </label>
                <input
                  id="profile_address_line2"
                  name="address_line2"
                  defaultValue={driver.address_line2 ?? ""}
                  autoComplete="address-line2"
                  className="rph-input-auth"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="profile_address_town" className="rph-label-lg">
                    Town / city
                  </label>
                  <input
                    id="profile_address_town"
                    name="address_town"
                    required
                    defaultValue={driver.address_town}
                    autoComplete="address-level2"
                    className="rph-input-auth"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="profile_address_county" className="rph-label-lg">
                    County (optional)
                  </label>
                  <input
                    id="profile_address_county"
                    name="address_county"
                    defaultValue={driver.address_county ?? ""}
                    autoComplete="address-level1"
                    className="rph-input-auth"
                  />
                </div>
                <div className="space-y-1 sm:max-w-xs">
                  <label htmlFor="profile_address_postcode" className="rph-label-lg">
                    UK postcode
                  </label>
                  <input
                    id="profile_address_postcode"
                    name="address_postcode"
                    required
                    defaultValue={driver.address_postcode}
                    autoComplete="postal-code"
                    className="rph-input-auth"
                  />
                </div>
              </div>
              <Submit label="Save address" />
              </form>
            )}
          </section>
        </div>
      ) : null}

      {tab === "security" ? (
        <div className="space-y-4" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Change password</h2>
            {readOnly ? (
              <p className="rph-muted mt-2 text-sm">Password changes are not available in admin preview.</p>
            ) : (
              <>
                <p className="rph-muted mt-1 text-sm">Use at least 8 characters. You will stay signed in after changing it.</p>
                <form action={passwordAction} className="mt-4 max-w-md space-y-4">
              {passwordState.error ? <p className="rph-alert-error">{passwordState.error}</p> : null}
              {passwordState.ok ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
                  Password updated.
                </p>
              ) : null}
              <div className="space-y-1">
                <label htmlFor="profile_current_password" className="rph-label-lg">
                  Current password
                </label>
                <input
                  id="profile_current_password"
                  name="current_password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="rph-input-auth"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="profile_new_password" className="rph-label-lg">
                  New password
                </label>
                <input
                  id="profile_new_password"
                  name="new_password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="rph-input-auth"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="profile_confirm_password" className="rph-label-lg">
                  Confirm new password
                </label>
                <input
                  id="profile_confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="rph-input-auth"
                />
              </div>
              <Submit label="Update password" />
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}

      {tab === "licences" ? (
        <div className="space-y-4" role="tabpanel">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Licences (summary)</h2>
            {readOnly && previewFullLicencesHref ? (
              <p className="mt-2 text-sm">
                <Link
                  href={previewFullLicencesHref}
                  className="rph-link-inline font-semibold"
                >
                  Open full licences &amp; document photos →
                </Link>
              </p>
            ) : null}
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Driving — number" value={driver.driving_licence_number?.trim() || "—"} />
              <Row label="Driving — expiry" value={formatLicenceDate(driver.driving_licence_expiry)} />
              <Row
                label="Driving — photos"
                value={driver.drivingPhotosOnFile ? "Front and back on file" : "Not on file"}
              />
              <Row label="PHV / taxi — number" value={driver.phv_licence_number?.trim() || "—"} />
              <Row label="PHV / taxi — authority" value={driver.phv_licensing_authority?.trim() || "—"} />
              <Row label="PHV / taxi — expiry" value={formatLicenceDate(driver.phv_licence_expiry)} />
              <Row label="PHV / taxi — photo" value={driver.phvPhotoOnFile ? "On file" : "Not on file"} />
            </dl>
            {readOnly ? (
              <p className="rph-muted mt-4 text-sm">
                Document images and licence updates are managed by the driver under Licences in their account.
              </p>
            ) : (
              <p className="mt-4">
                <Link href="/driver/onboarding" className="rph-link-inline text-sm font-medium">
                  Open Licences to view or update
                </Link>
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[minmax(8rem,auto)_1fr] sm:gap-x-4">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}
