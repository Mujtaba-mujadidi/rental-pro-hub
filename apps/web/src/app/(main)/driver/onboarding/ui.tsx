"use client";

import { Fragment, useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  saveDriverOnboardingDrivingStep,
  saveDriverOnboardingPhvStep,
  type LicenceActionResult,
} from "@/app/actions/driver-onboarding";
import { formatLicenceDate } from "@/lib/driver/licence-display";
import { phvLicenceNeedsAddressCatchUp } from "@/lib/driver/licence-check";
import { daysFromTodayToExpiry, LICENCE_EXPIRING_SOON_MAX_DAYS } from "@/lib/driver/licence-attention";
import { UK_DRIVING_LICENCE_NUMBER_HINT } from "@/lib/validation/driver-signup";
import { LicenceImageGallery, type LicenceGalleryItem } from "./licence-image-gallery";

const initial: LicenceActionResult = {};

const STEP_LABELS = ["Driving licence", "PHV / taxi licence"] as const;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rph-btn-primary-wide mt-0 w-full">
      {pending ? "Saving…" : label}
    </button>
  );
}

export type DriverLicenceRow = {
  driving_licence_number: string | null;
  driving_licence_expiry: string | null;
  phv_licence_number: string | null;
  phv_licensing_authority: string | null;
  phv_licence_expiry: string | null;
  driving_licence_front_path: string | null;
  driving_licence_back_path: string | null;
  phv_licence_card_path: string | null;
  driving_address_confirmed_at?: string | null;
  phv_address_confirmed_at?: string | null;
  licence_revalidation_due_at?: string | null;
  pending_address_submitted_at?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_town?: string | null;
  address_county?: string | null;
  address_postcode?: string | null;
  pending_address_line1?: string | null;
  pending_address_line2?: string | null;
  pending_address_town?: string | null;
  pending_address_county?: string | null;
  pending_address_postcode?: string | null;
};

export type LicenceImageUrls = {
  front: string | null;
  back: string | null;
  phv: string | null;
};

function isoDate(d: string | null): string {
  if (!d) return "";
  return d.slice(0, 10);
}

function formatAddressForDisplay(parts: {
  line1: string | null | undefined;
  line2?: string | null;
  town: string | null | undefined;
  county?: string | null;
  postcode: string | null | undefined;
}): string {
  const bits = [parts.line1, parts.line2, parts.town, parts.county, parts.postcode]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  return bits.join(", ") || "—";
}

function licenceConfirmationAddressLine(row: DriverLicenceRow): string {
  const pending = Boolean(row.pending_address_submitted_at);
  if (pending) {
    return formatAddressForDisplay({
      line1: row.pending_address_line1,
      line2: row.pending_address_line2,
      town: row.pending_address_town,
      county: row.pending_address_county,
      postcode: row.pending_address_postcode,
    });
  }
  return formatAddressForDisplay({
    line1: row.address_line1,
    line2: row.address_line2,
    town: row.address_town,
    county: row.address_county,
    postcode: row.address_postcode,
  });
}

type LicenceStatusTone = "ok" | "warn" | "expiring" | "danger";

type LicenceCardStatus = {
  label: string;
  tone: LicenceStatusTone;
  /** Secondary line, e.g. days until expiry (shown when not expired, or extra context). */
  expiryNote?: string;
};

function expiringSoonNote(days: number): string {
  if (days === 0) return "Expires today.";
  if (days === 1) return "Expiring in 1 day.";
  return `Expiring in ${days} days.`;
}

function licenceExpirySignals(iso: string | null | undefined): {
  days: number | null;
  expired: boolean;
  expiringSoon: boolean;
} {
  const days = daysFromTodayToExpiry(iso);
  if (days === null) {
    return { days: null, expired: false, expiringSoon: false };
  }
  return {
    days,
    expired: days < 0,
    expiringSoon: days >= 0 && days <= LICENCE_EXPIRING_SOON_MAX_DAYS,
  };
}

function statusPillClass(tone: LicenceStatusTone): string {
  switch (tone) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100";
    case "expiring":
      return "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-800/65 dark:bg-orange-950/45 dark:text-orange-100";
    case "danger":
      return "border-red-300 bg-red-50 text-red-950 dark:border-red-900/55 dark:bg-red-950/40 dark:text-red-100";
  }
}

function applyExpiringPresentation(
  tone: LicenceStatusTone,
  expiringSoon: boolean,
  days: number | null,
): { tone: LicenceStatusTone; expiryNote?: string } {
  if (!expiringSoon || days === null) {
    return { tone };
  }
  return { tone: "expiring", expiryNote: expiringSoonNote(days) };
}

function drivingLicenceStatus(row: DriverLicenceRow): LicenceCardStatus {
  const hasFront = Boolean(row.driving_licence_front_path);
  const hasBack = Boolean(row.driving_licence_back_path);
  const hasDetails = Boolean(row.driving_licence_number?.trim()) && Boolean(row.driving_licence_expiry);
  const { days, expired, expiringSoon } = licenceExpirySignals(row.driving_licence_expiry);

  if (!hasFront || !hasBack || !hasDetails) {
    if (expired && row.driving_licence_expiry) {
      return { label: "Incomplete — licence expired", tone: "danger", expiryNote: "Renew and complete your details and photos." };
    }
    if (expiringSoon && row.driving_licence_expiry && days !== null) {
      return { label: "Incomplete", tone: "expiring", expiryNote: expiringSoonNote(days) };
    }
    return { label: "Incomplete", tone: "warn" };
  }

  if (expired) {
    return { label: "Expired — update required", tone: "danger" };
  }

  const pending = Boolean(row.pending_address_submitted_at);
  const reval = Boolean(row.licence_revalidation_due_at);
  const confirmed = Boolean(row.driving_address_confirmed_at);

  let label: string;
  let tone: LicenceStatusTone;

  if (pending) {
    label = "New address — upload updated photos";
    tone = "warn";
  } else if (reval && !confirmed) {
    label = "Confirm licence matches address";
    tone = "warn";
  } else {
    label = "Current";
    tone = "ok";
  }

  const exp = applyExpiringPresentation(tone, expiringSoon, days);
  return { label, tone: exp.tone, expiryNote: exp.expiryNote };
}

function phvLicenceStatus(row: DriverLicenceRow): LicenceCardStatus {
  const hasPhoto = Boolean(row.phv_licence_card_path);
  const hasDetails =
    Boolean(row.phv_licence_number?.trim()) &&
    Boolean(row.phv_licensing_authority?.trim()) &&
    Boolean(row.phv_licence_expiry);
  const { days, expired, expiringSoon } = licenceExpirySignals(row.phv_licence_expiry);

  if (!hasPhoto || !hasDetails) {
    if (expired && row.phv_licence_expiry) {
      return { label: "Incomplete — licence expired", tone: "danger", expiryNote: "Renew and complete your details and photo." };
    }
    if (expiringSoon && row.phv_licence_expiry && days !== null) {
      return { label: "Incomplete", tone: "expiring", expiryNote: expiringSoonNote(days) };
    }
    return { label: "Incomplete", tone: "warn" };
  }

  if (expired) {
    return { label: "Expired — update required", tone: "danger" };
  }

  const pending = Boolean(row.pending_address_submitted_at);
  const reval = Boolean(row.licence_revalidation_due_at);
  const phvConfirmed = Boolean(row.phv_address_confirmed_at);
  const catchUp = phvLicenceNeedsAddressCatchUp(row);

  let label: string;
  let tone: LicenceStatusTone;

  if (pending) {
    label = "New address — upload updated photos";
    tone = "warn";
  } else if (reval && !phvConfirmed) {
    label = "Confirm licence matches address";
    tone = "warn";
  } else if (catchUp) {
    label = "Confirm updated address on licence";
    tone = "warn";
  } else {
    label = "Current";
    tone = "ok";
  }

  const exp = applyExpiringPresentation(tone, expiringSoon, days);
  return { label, tone: exp.tone, expiryNote: exp.expiryNote };
}

function LicenceDualStatus({ row }: { row: DriverLicenceRow }) {
  const d = drivingLicenceStatus(row);
  const p = phvLicenceStatus(row);
  return (
    <div
      className="grid gap-3 sm:grid-cols-2"
      aria-label="Licence status"
    >
      <div className={`rounded-xl border px-4 py-3 text-sm ${statusPillClass(d.tone)}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Driving licence</p>
        <p className="mt-1 font-medium leading-snug">{d.label}</p>
        {d.expiryNote ? (
          <p className="mt-1.5 text-xs font-semibold leading-snug opacity-95">{d.expiryNote}</p>
        ) : null}
      </div>
      <div className={`rounded-xl border px-4 py-3 text-sm ${statusPillClass(p.tone)}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">PHV / taxi licence</p>
        <p className="mt-1 font-medium leading-snug">{p.label}</p>
        {p.expiryNote ? (
          <p className="mt-1.5 text-xs font-semibold leading-snug opacity-95">{p.expiryNote}</p>
        ) : null}
      </div>
    </div>
  );
}

function OnboardingStepProgress({ step }: { step: number }) {
  return (
    <nav className="mb-8" aria-label="Onboarding steps">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-zinc-500">
        Step {step} of {STEP_LABELS.length}
      </p>
      <ol className="flex w-full items-center px-0.5 sm:px-2">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          const segmentBeforeOrange = i > 0 && step > i;

          return (
            <Fragment key={n}>
              {i > 0 ? (
                <li className="mx-1 h-1 min-w-[12px] flex-1 list-none sm:mx-3" aria-hidden>
                  <div
                    className={[
                      "h-full w-full rounded-full transition-colors duration-300",
                      segmentBeforeOrange ? "bg-orange-500" : "bg-zinc-200 dark:bg-zinc-700",
                    ].join(" ")}
                  />
                </li>
              ) : null}
              <li className="flex list-none flex-col items-center">
                <div
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all",
                    done &&
                      "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25",
                    active &&
                      "border-orange-500 bg-white text-orange-600 shadow-md ring-4 ring-orange-100 dark:bg-zinc-900 dark:text-orange-400 dark:ring-orange-950/50",
                    !done &&
                      !active &&
                      "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-500",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={`${n}. ${label}`}
                >
                  {done ? (
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    n
                  )}
                </div>
                <span
                  className={[
                    "mt-2 hidden max-w-[7rem] text-center text-[11px] font-semibold leading-tight sm:block",
                    active
                      ? "text-orange-700 dark:text-orange-400"
                      : done
                        ? "text-zinc-600 dark:text-zinc-400"
                        : "text-zinc-400 dark:text-zinc-500",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-sm font-semibold text-orange-700 dark:text-orange-400 sm:hidden">
        {STEP_LABELS[step - 1]}
      </p>
    </nav>
  );
}

const fileInputClass =
  "rph-input-auth py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1 file:text-sm dark:file:bg-slate-700";

/** Matches checkbox styling used in licence confirmations. */
const attestCheckboxClass =
  "mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-rph-rail focus:ring-rph-rail/30";

const wizardStepFooterBackClass =
  "flex h-full min-h-11 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:min-w-[5.5rem]";
const wizardStepFooterPrimaryClass =
  "flex h-full min-h-11 w-full items-center justify-center rounded-lg bg-rph-rail px-4 py-3 text-center text-sm font-medium leading-snug text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer";

function SubmitPaired({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={wizardStepFooterPrimaryClass}>
      {pending ? "Saving…" : label}
    </button>
  );
}

const stepSwitchBtn =
  "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
const stepSwitchActive =
  "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300";
const stepSwitchIdle =
  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

export function DriverLicencesOnboardingForm({
  initialRow,
  initialStep,
  onboardingComplete,
  phvRedirectTarget,
}: {
  initialRow: DriverLicenceRow;
  initialStep: 1 | 2;
  onboardingComplete: boolean;
  phvRedirectTarget: "driver" | "onboarding";
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [drivingState, drivingAction] = useActionState(saveDriverOnboardingDrivingStep, initial);
  const [phvState, phvAction] = useActionState(saveDriverOnboardingPhvStep, initial);

  const hasFront = Boolean(initialRow.driving_licence_front_path);
  const hasBack = Boolean(initialRow.driving_licence_back_path);
  const hasPhv = Boolean(initialRow.phv_licence_card_path);
  const drivingPhotosDone = hasFront && hasBack;
  const confirmAddressLine = licenceConfirmationAddressLine(initialRow);
  const addressIsPending = Boolean(initialRow.pending_address_submitted_at);
  const requireDrivingAddressAttestation = Boolean(
    initialRow.pending_address_submitted_at || initialRow.licence_revalidation_due_at,
  );
  const requirePhvAddressAttestation = Boolean(
    initialRow.pending_address_submitted_at ||
      initialRow.licence_revalidation_due_at ||
      phvLicenceNeedsAddressCatchUp(initialRow),
  );

  useEffect(() => {
    if (drivingState.drivingStepSavedAt) {
      // During initial onboarding we force the user into step 2.
      // For post-onboarding updates, allow updating a single licence and staying on the same step.
      if (!onboardingComplete) setStep(2);
      router.refresh();
    }
  }, [drivingState.drivingStepSavedAt, router]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  return (
    <div className="space-y-6">
      {onboardingComplete ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={[stepSwitchBtn, step === 1 ? stepSwitchActive : stepSwitchIdle].join(" ")}
          >
            Driving licence
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={[stepSwitchBtn, step === 2 ? stepSwitchActive : stepSwitchIdle].join(" ")}
          >
            PHV / taxi licence
          </button>
        </div>
      ) : null}
      {!onboardingComplete ? <OnboardingStepProgress step={step} /> : null}

      {step === 1 ? (
        <form action={drivingAction} className="space-y-4">
          {drivingState.error ? <p className="rph-alert-error">{drivingState.error}</p> : null}
          <p className="rph-muted text-sm">
            {drivingPhotosDone
              ? "Photos are optional unless you want to replace a file."
              : "Upload JPEG, PNG, or WebP images (max 5 MB each). Front and back photos are required for this step."}
          </p>

          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Driving licence</h2>
            <p className="rph-muted mt-1 text-sm">
              Enter your DVLA details and upload clear photos of the front and back of your photocard.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div className="space-y-1">
              <label htmlFor="driving_licence_front" className="rph-label-lg">
                Driving licence — front photo
              </label>
              <input
                id="driving_licence_front"
                name="driving_licence_front"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required={!hasFront}
                className={fileInputClass}
              />
              {hasFront ? (
                <p className="rph-meta">A file is already stored. Choose a new file to replace it.</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor="driving_licence_back" className="rph-label-lg">
                Driving licence — back photo
              </label>
              <input
                id="driving_licence_back"
                name="driving_licence_back"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required={!hasBack}
                className={fileInputClass}
              />
              {hasBack ? (
                <p className="rph-meta">A file is already stored. Choose a new file to replace it.</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="driving_licence_number" className="rph-label-lg">
                Driving licence number
              </label>
              <input
                id="driving_licence_number"
                name="driving_licence_number"
                type="text"
                required
                maxLength={40}
                spellCheck={false}
                placeholder="As on your photocard"
                className="rph-input-auth"
                defaultValue={initialRow.driving_licence_number ?? ""}
                autoComplete="off"
              />
              <p className="rph-meta">{UK_DRIVING_LICENCE_NUMBER_HINT}</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="driving_licence_expiry" className="rph-label-lg">
                Driving licence expiry
              </label>
              <input
                id="driving_licence_expiry"
                name="driving_licence_expiry"
                type="date"
                required
                className="rph-input-auth"
                defaultValue={isoDate(initialRow.driving_licence_expiry)}
              />
            </div>
          </div>

          {requireDrivingAddressAttestation ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Confirm your driving licence
              </h3>
              <p className="rph-muted mt-1 text-sm">
                We need to know the address shown on your photocard matches{" "}
                {addressIsPending
                  ? "the new address you have saved (not yet active until your new photos are submitted)."
                  : "the address we currently hold for your profile."}{" "}
                <span className="font-medium text-slate-800 dark:text-slate-200">{confirmAddressLine}</span>
              </p>
              <label className="mt-4 flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50">
                <input
                  type="checkbox"
                  name="confirm_wizard_driving_matches_address"
                  value="on"
                  required
                  className={attestCheckboxClass}
                />
                <span className="text-sm text-slate-800 dark:text-slate-200">
                  I confirm the address on my driving licence matches the address above and these details and
                  photos are correct.
                </span>
              </label>
            </div>
          ) : null}

          <Submit
            label={
              requireDrivingAddressAttestation
                ? onboardingComplete
                  ? "Confirm and save driving licence"
                  : "Confirm and continue to PHV / taxi licence"
                : onboardingComplete
                  ? "Save driving licence"
                  : "Continue to PHV / taxi licence"
            }
          />
        </form>
      ) : null}

      {step === 2 ? (
        <form action={phvAction} className="space-y-4">
          <input type="hidden" name="redirect_after_phv" value={phvRedirectTarget} />
          {phvState.error ? <p className="rph-alert-error">{phvState.error}</p> : null}
          <p className="rph-muted text-sm">
            {hasPhv
              ? "Photo is optional unless you want to replace the file."
              : "Upload a JPEG, PNG, or WebP image (max 5 MB). A licence photo is required to finish onboarding."}
          </p>

          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              PHV / taxi licence
            </h2>
            <p className="rph-muted mt-1 text-sm">
              Private hire vehicle or taxi badge details and one photo of the document.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="phv_licence_card" className="rph-label-lg">
              PHV / taxi licence photo
            </label>
            <input
              id="phv_licence_card"
              name="phv_licence_card"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={!hasPhv}
              className={fileInputClass}
            />
            {hasPhv ? (
              <p className="rph-meta">A file is already stored. Choose a new file to replace it.</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="phv_licence_number" className="rph-label-lg">
                PHV / taxi licence number
              </label>
              <input
                id="phv_licence_number"
                name="phv_licence_number"
                type="text"
                required
                className="rph-input-auth"
                defaultValue={initialRow.phv_licence_number ?? ""}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="phv_licensing_authority" className="rph-label-lg">
                Licensing authority
              </label>
              <input
                id="phv_licensing_authority"
                name="phv_licensing_authority"
                type="text"
                required
                placeholder="e.g. Transport for London (TfL), or your council"
                className="rph-input-auth"
                defaultValue={initialRow.phv_licensing_authority ?? ""}
                autoComplete="off"
              />
              <p className="rph-meta">Who issued your private hire or taxi badge.</p>
            </div>
            <div className="space-y-1 sm:max-w-xs">
              <label htmlFor="phv_licence_expiry" className="rph-label-lg">
                PHV / taxi licence expiry
              </label>
              <input
                id="phv_licence_expiry"
                name="phv_licence_expiry"
                type="date"
                required
                className="rph-input-auth"
                defaultValue={isoDate(initialRow.phv_licence_expiry)}
              />
            </div>
          </div>

          {requirePhvAddressAttestation ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Confirm your PHV / taxi licence
              </h3>
              <p className="rph-muted mt-1 text-sm">
                We need to know the address on your badge or licence record matches{" "}
                {addressIsPending
                  ? "the new address you have saved."
                  : "the address we currently hold for your profile."}{" "}
                <span className="font-medium text-slate-800 dark:text-slate-200">{confirmAddressLine}</span>
              </p>
              <label className="mt-4 flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50">
                <input
                  type="checkbox"
                  name="confirm_wizard_phv_matches_address"
                  value="on"
                  required
                  className={attestCheckboxClass}
                />
                <span className="text-sm text-slate-800 dark:text-slate-200">
                  I confirm the address on my PHV / taxi licence matches the address above and these details
                  and photo are correct.
                </span>
              </label>
            </div>
          ) : null}

          {onboardingComplete ? (
            <SubmitPaired
              label={
                requirePhvAddressAttestation
                  ? "Confirm and save PHV / taxi licence"
                  : "Save PHV / taxi licence"
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-stretch">
              <button type="button" className={wizardStepFooterBackClass} onClick={() => setStep(1)}>
                Back
              </button>
              <div className="flex min-w-0 flex-col">
                <SubmitPaired
                  label={
                    requirePhvAddressAttestation
                      ? "Confirm and continue to driver home"
                      : "Save and continue to driver home"
                  }
                />
              </div>
            </div>
          )}
        </form>
      ) : null}
    </div>
  );
}

const btnOutline =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <dl className="mt-4 space-y-3">{children}</dl>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[minmax(8rem,auto)_1fr] sm:gap-x-4">
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

export function DriverLicencesPage({
  onboardingComplete,
  initialStep,
  initialRow,
  imageUrls,
  licenceAttentionLines = [],
  licenceRevalidationDue = false,
  adminPreview = false,
}: {
  onboardingComplete: boolean;
  initialStep: 1 | 2;
  initialRow: DriverLicenceRow;
  imageUrls: LicenceImageUrls;
  /** When non-empty, driver must update licences (expiry / address). */
  licenceAttentionLines?: string[];
  /** `licence_revalidation_due_at` set — wizard saves must include address attestations. */
  licenceRevalidationDue?: boolean;
  /** Super-admin read-only: no forms; full summary + signed image URLs only. */
  adminPreview?: boolean;
}) {
  const isAdminPreview = Boolean(adminPreview);
  const mustUpdateLicences = licenceAttentionLines.length > 0;
  const [editing, setEditing] = useState(
    () => !isAdminPreview && (!onboardingComplete || (onboardingComplete && mustUpdateLicences)),
  );

  const [galleryOpen, setGalleryOpen] = useState(false);

  const hasAnyImage = Boolean(imageUrls.front || imageUrls.back || imageUrls.phv);

  const galleryItems: LicenceGalleryItem[] = [];
  if (imageUrls.front) {
    galleryItems.push({ label: "Driving licence — front", url: imageUrls.front });
  }
  if (imageUrls.back) {
    galleryItems.push({ label: "Driving licence — back", url: imageUrls.back });
  }
  if (imageUrls.phv) {
    galleryItems.push({ label: "PHV / taxi licence", url: imageUrls.phv });
  }

  const showReadOnlySummary = isAdminPreview || (onboardingComplete && !editing);

  const showForm = !isAdminPreview && (!onboardingComplete || editing);

  const summaryBlock = (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard title="Driving licence">
          <SummaryRow
            label="Licence number"
            value={initialRow.driving_licence_number?.trim() || "—"}
          />
          <SummaryRow label="Expiry" value={formatLicenceDate(initialRow.driving_licence_expiry)} />
          <SummaryRow
            label="Photos"
            value={
              [initialRow.driving_licence_front_path && "Front", initialRow.driving_licence_back_path && "Back"]
                .filter(Boolean)
                .join(", ") || "—"
            }
          />
        </SummaryCard>
        <SummaryCard title="PHV / taxi licence">
          <SummaryRow label="Licence number" value={initialRow.phv_licence_number?.trim() || "—"} />
          <SummaryRow
            label="Licensing authority"
            value={initialRow.phv_licensing_authority?.trim() || "—"}
          />
          <SummaryRow label="Expiry" value={formatLicenceDate(initialRow.phv_licence_expiry)} />
          <SummaryRow label="Photo" value={initialRow.phv_licence_card_path ? "On file" : "—"} />
        </SummaryCard>
      </div>
      {isAdminPreview ? (
        <SummaryCard title="Address on profile & confirmations">
          <SummaryRow
            label="Registered address"
            value={formatAddressForDisplay({
              line1: initialRow.address_line1,
              line2: initialRow.address_line2,
              town: initialRow.address_town,
              county: initialRow.address_county,
              postcode: initialRow.address_postcode,
            })}
          />
          <SummaryRow
            label="Driving licence — address confirmed"
            value={formatLicenceDate(initialRow.driving_address_confirmed_at)}
          />
          <SummaryRow
            label="PHV — address confirmed"
            value={formatLicenceDate(initialRow.phv_address_confirmed_at)}
          />
          <SummaryRow
            label="Revalidation due"
            value={initialRow.licence_revalidation_due_at ? formatLicenceDate(initialRow.licence_revalidation_due_at) : "—"}
          />
        </SummaryCard>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
        <button
          type="button"
          className="rph-btn-primary-wide mt-0 sm:w-auto sm:min-w-[10rem]"
          disabled={!hasAnyImage}
          title={!hasAnyImage ? "No images stored yet" : undefined}
          onClick={() => setGalleryOpen(true)}
        >
          View images
        </button>
        {!isAdminPreview ? (
          <button type="button" className={`${btnOutline} sm:mt-0`} onClick={() => setEditing(true)}>
            Update licences
          </button>
        ) : null}
      </div>
      {!hasAnyImage ? (
        <p className="rph-muted text-sm">
          {isAdminPreview
            ? "No signed image URLs — missing files or storage access."
            : "Image links are unavailable. Use Update licences to add photos."}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      {mustUpdateLicences ? (
        <div
          className="rounded-xl border border-amber-300/90 bg-amber-50 px-4 py-3 dark:border-amber-800/80 dark:bg-amber-950/40 sm:px-5"
          role="alert"
        >
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Licence update required
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-950/90 dark:text-amber-100/90">
            {licenceAttentionLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {initialRow.pending_address_submitted_at ||
          licenceRevalidationDue ||
          phvLicenceNeedsAddressCatchUp(initialRow) ? (
            initialRow.pending_address_submitted_at ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-amber-200/90 bg-white/70 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/90">
                    Current address (active on profile)
                  </p>
                  <p className="mt-1 text-sm font-medium leading-snug text-amber-950 dark:text-amber-50">
                    {formatAddressForDisplay({
                      line1: initialRow.address_line1,
                      line2: initialRow.address_line2,
                      town: initialRow.address_town,
                      county: initialRow.address_county,
                      postcode: initialRow.address_postcode,
                    })}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200/90 bg-white/70 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/90">
                    New address (pending until licence photos updated)
                  </p>
                  <p className="mt-1 text-sm font-medium leading-snug text-amber-950 dark:text-amber-50">
                    {formatAddressForDisplay({
                      line1: initialRow.pending_address_line1,
                      line2: initialRow.pending_address_line2,
                      town: initialRow.pending_address_town,
                      county: initialRow.pending_address_county,
                      postcode: initialRow.pending_address_postcode,
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-200/90 bg-white/70 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/90">
                  Address on your profile
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-amber-950 dark:text-amber-50">
                  {formatAddressForDisplay({
                    line1: initialRow.address_line1,
                    line2: initialRow.address_line2,
                    town: initialRow.address_town,
                    county: initialRow.address_county,
                    postcode: initialRow.address_postcode,
                  })}
                </p>
              </div>
            )
          ) : null}
          <p className="mt-2 text-sm text-amber-950/85 dark:text-amber-100/85">
            {isAdminPreview
              ? "Review status, confirmations, and images below."
              : "Use the tabs below to update your details and images."}
          </p>
        </div>
      ) : null}

      <LicenceDualStatus row={initialRow} />

      {showReadOnlySummary ? summaryBlock : null}

      {showForm ? (
        <div className="space-y-4">
          {onboardingComplete && editing ? (
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Update your details or replace document photos below.
              </p>
              <div className="flex flex-wrap gap-2">
                {hasAnyImage ? (
                  <button type="button" className={btnOutline} onClick={() => setGalleryOpen(true)}>
                    View images
                  </button>
                ) : null}
                {!mustUpdateLicences ? (
                  <button type="button" className={btnOutline} onClick={() => setEditing(false)}>
                    Cancel update
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {!onboardingComplete && hasAnyImage ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm font-medium text-rph-rail underline decoration-rph-rail/35 hover:text-rph-rail-hover dark:text-rph-rail-softer"
                onClick={() => setGalleryOpen(true)}
              >
                View uploaded images
              </button>
            </div>
          ) : null}
          <DriverLicencesOnboardingForm
            initialRow={initialRow}
            initialStep={initialStep}
            onboardingComplete={onboardingComplete}
            phvRedirectTarget={onboardingComplete ? "onboarding" : "driver"}
          />
        </div>
      ) : null}

      <LicenceImageGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        items={galleryItems}
      />
    </div>
  );
}
