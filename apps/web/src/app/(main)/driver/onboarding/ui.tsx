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
import { UK_DRIVING_LICENCE_NUMBER_HINT } from "@/lib/validation/driver-signup";
import { AddressLicenceAttestPhvStep } from "./address-attestation";
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

/** Matches checkbox styling in address attestation + gate steps. */
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

export function DriverLicencesOnboardingForm({
  initialRow,
  initialStep,
  onboardingComplete,
  phvRedirectTarget,
  requireWizardAddressAttestation,
}: {
  initialRow: DriverLicenceRow;
  initialStep: 1 | 2;
  onboardingComplete: boolean;
  phvRedirectTarget: "driver" | "onboarding";
  /** After address change: require checkbox(es) on save so the wizard path matches two-step confirmation. */
  requireWizardAddressAttestation: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [drivingState, drivingAction] = useActionState(saveDriverOnboardingDrivingStep, initial);
  const [phvState, phvAction] = useActionState(saveDriverOnboardingPhvStep, initial);

  const hasFront = Boolean(initialRow.driving_licence_front_path);
  const hasBack = Boolean(initialRow.driving_licence_back_path);
  const hasPhv = Boolean(initialRow.phv_licence_card_path);
  const drivingPhotosDone = hasFront && hasBack;

  useEffect(() => {
    if (drivingState.drivingStepSavedAt) {
      setStep(2);
      router.refresh();
    }
  }, [drivingState.drivingStepSavedAt, router]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  return (
    <div className="space-y-6">
      <OnboardingStepProgress step={step} />

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

          {requireWizardAddressAttestation ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Step 1 of 2 — Driving licence
              </h3>
              <p className="rph-muted mt-1 text-sm">
                Confirm that your driving licence number, expiry, and front/back photos on file are correct
                for your current address.
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
                  I confirm my driving licence number, expiry date, and front and back photos match my
                  current address and are up to date.
                </span>
              </label>
            </div>
          ) : null}

          <Submit
            label={
              requireWizardAddressAttestation
                ? onboardingComplete
                  ? "Continue to step 2"
                  : "Continue to PHV / taxi licence"
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

          {requireWizardAddressAttestation ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Step 2 of 2 — PHV / taxi licence
              </h3>
              <p className="rph-muted mt-1 text-sm">
                Confirm that your PHV / taxi licence details and photo on file are correct for your current
                address.
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
                  I confirm my PHV / taxi licence number, licensing authority, expiry, and photo match my
                  current address and are up to date.
                </span>
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-stretch">
            <button type="button" className={wizardStepFooterBackClass} onClick={() => setStep(1)}>
              Back
            </button>
            <div className="flex min-w-0 flex-col">
              <SubmitPaired
                label={
                  requireWizardAddressAttestation
                    ? onboardingComplete
                      ? "Confirm and go to dashboard"
                      : "Confirm and continue to driver home"
                    : onboardingComplete
                      ? "Save changes"
                      : "Save and continue to driver home"
                }
              />
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

const btnOutline =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

/** Same padding and line height as paired sibling; grid row stretch + h-full keeps equal heights when one label wraps. */
const gateChoiceBtnBase =
  "flex h-full min-h-11 w-full items-center justify-center px-4 py-3 text-center text-sm font-medium leading-snug";
const gateChoiceBtnPrimary = `${gateChoiceBtnBase} rounded-lg bg-rph-rail text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50 dark:bg-rph-rail-soft dark:hover:bg-rph-rail-softer`;
const gateChoiceBtnSecondary = `${gateChoiceBtnBase} rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`;

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

type AddressRevalidationPhase = "gate" | "attest-driving" | "attest-phv" | "wizard" | null;

export function DriverLicencesPage({
  onboardingComplete,
  initialStep,
  initialRow,
  imageUrls,
  licenceAttentionLines = [],
  addressOnlyAttention = false,
  licenceRevalidationDue = false,
}: {
  onboardingComplete: boolean;
  initialStep: 1 | 2;
  initialRow: DriverLicenceRow;
  imageUrls: LicenceImageUrls;
  /** When non-empty, driver must update licences (expiry / address). */
  licenceAttentionLines?: string[];
  /** Sole reason is address change — show confirm-vs-update gate + two-step attestation. */
  addressOnlyAttention?: boolean;
  /** `licence_revalidation_due_at` set — wizard saves must include address attestations. */
  licenceRevalidationDue?: boolean;
}) {
  const mustUpdateLicences = licenceAttentionLines.length > 0;

  const [addressPhase, setAddressPhase] = useState<AddressRevalidationPhase>(() => {
    if (onboardingComplete && addressOnlyAttention) return "gate";
    return null;
  });

  const [drivingAttestChecked, setDrivingAttestChecked] = useState(false);

  const [editing, setEditing] = useState(() => {
    if (onboardingComplete && addressOnlyAttention) return false;
    return !onboardingComplete || (onboardingComplete && mustUpdateLicences);
  });

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

  const inAddressAttestation =
    onboardingComplete &&
    addressOnlyAttention &&
    addressPhase !== null &&
    addressPhase !== "wizard";

  const showReadOnlySummary =
    onboardingComplete &&
    (addressPhase === "gate" ||
      addressPhase === "attest-driving" ||
      addressPhase === "attest-phv" ||
      (addressPhase === null && !editing));

  const showForm =
    !onboardingComplete || editing || addressPhase === "wizard";

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
      {!inAddressAttestation ? (
        <>
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
            <button type="button" className={`${btnOutline} sm:mt-0`} onClick={() => setEditing(true)}>
              Update licences
            </button>
          </div>
          {!hasAnyImage ? (
            <p className="rph-muted text-sm">Image links are unavailable. Use Update licences to add photos.</p>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${btnOutline} sm:mt-0`}
            disabled={!hasAnyImage}
            onClick={() => setGalleryOpen(true)}
          >
            View images
          </button>
        </div>
      )}
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
          <p className="mt-2 text-sm text-amber-950/85 dark:text-amber-100/85">
            {addressOnlyAttention && onboardingComplete ? (
              <>
                Either confirm in two steps that both licences on file already match your new address, or open
                the full updater to change details or replace images. Saving the forms without any changes will
                not clear this requirement.
                {onboardingComplete
                  ? " Your driver dashboard stays unavailable until this is resolved."
                  : null}
              </>
            ) : (
              <>
                Use the steps below to update your details and images.
                {onboardingComplete
                  ? " Your driver dashboard stays unavailable until this is resolved."
                  : null}
              </>
            )}
          </p>
        </div>
      ) : null}

      {showReadOnlySummary ? summaryBlock : null}

      {addressPhase === "gate" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            After an address change
          </h3>
          <p className="rph-muted mt-1 text-sm">
            Choose how you want to proceed. If nothing on your licences has changed, use the two-step
            confirmation. If you need to edit fields or upload new photos, use the full update flow (starts
            with your driving licence).
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch">
            <button
              type="button"
              className={gateChoiceBtnPrimary}
              onClick={() => {
                setDrivingAttestChecked(false);
                setAddressPhase("attest-driving");
              }}
            >
              Licences already match — confirm
            </button>
            <button
              type="button"
              className={gateChoiceBtnSecondary}
              onClick={() => {
                setAddressPhase("wizard");
                setEditing(true);
              }}
            >
              Update licence details and photos
            </button>
          </div>
        </div>
      ) : null}

      {addressPhase === "attest-driving" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Step 1 of 2 — Driving licence
          </h3>
          <p className="rph-muted mt-1 text-sm">
            Confirm that your driving licence number, expiry, and front/back photos on file are correct for
            your current address.
          </p>
          <label className="mt-4 flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50">
            <input
              type="checkbox"
              checked={drivingAttestChecked}
              onChange={(e) => setDrivingAttestChecked(e.target.checked)}
              className={attestCheckboxClass}
            />
            <span className="text-sm text-slate-800 dark:text-slate-200">
              I confirm my driving licence number, expiry date, and front and back photos match my current
              address and are up to date.
            </span>
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={btnOutline}
              onClick={() => {
                setDrivingAttestChecked(false);
                setAddressPhase("gate");
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={!drivingAttestChecked}
              className="rph-btn-primary-wide mt-0 sm:w-auto disabled:opacity-50"
              onClick={() => setAddressPhase("attest-phv")}
            >
              Continue to step 2
            </button>
          </div>
        </div>
      ) : null}

      {addressPhase === "attest-phv" ? (
        <AddressLicenceAttestPhvStep
          onBack={() => {
            setAddressPhase("attest-driving");
          }}
        />
      ) : null}

      {showForm ? (
        <div className="space-y-4">
          {onboardingComplete && editing ? (
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {addressPhase === "wizard"
                  ? "Update your details or replace document photos. Tick the address confirmations on each step, or clear the check early on the driving step by changing a field or uploading new photos."
                  : "Update your details or replace document photos below."}
              </p>
              <div className="flex flex-wrap gap-2">
                {hasAnyImage ? (
                  <button type="button" className={btnOutline} onClick={() => setGalleryOpen(true)}>
                    View images
                  </button>
                ) : null}
                {addressOnlyAttention && addressPhase === "wizard" ? (
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => {
                      setAddressPhase("gate");
                      setEditing(false);
                    }}
                  >
                    Back to options
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
            requireWizardAddressAttestation={licenceRevalidationDue}
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
