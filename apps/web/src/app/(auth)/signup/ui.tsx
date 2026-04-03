"use client";

import { Fragment, useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { signUpDriverAction, type ActionResult } from "@/app/actions/auth";
import {
  MIN_DRIVER_AGE_YEARS,
  normalizeUkPostcode,
  parseUkDate,
  validateDriverAge,
} from "@/lib/validation/driver-signup";

const initial: ActionResult = {};

const STEP_LABELS = [
  "About you",
  "Contact",
  "UK address",
  "Password",
] as const;

type FieldErrors = Partial<Record<string, string>>;

function validateStep1(draft: Draft): FieldErrors {
  const e: FieldErrors = {};
  if (!draft.first_name.trim()) {
    e.first_name = "Enter your first name(s).";
  }
  if (!draft.last_name.trim()) {
    e.last_name = "Enter your last name.";
  }
  if (!draft.date_of_birth.trim()) {
    e.date_of_birth = "Enter your date of birth.";
  } else {
    const d = parseUkDate(draft.date_of_birth);
    if (!d) {
      e.date_of_birth = "Enter a valid date.";
    } else if (!validateDriverAge(d)) {
      e.date_of_birth = `You must be at least ${MIN_DRIVER_AGE_YEARS} years old to register.`;
    }
  }
  return e;
}

function validateStep2(draft: Draft): FieldErrors {
  const e: FieldErrors = {};
  const em = draft.email.trim();
  if (!em) {
    e.email = "Enter your email address.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    e.email = "Enter a valid email address.";
  }
  if (!draft.phone.trim()) {
    e.phone = "Enter your phone number.";
  }
  return e;
}

function validateStep3(draft: Draft): FieldErrors {
  const e: FieldErrors = {};
  if (!draft.address_line1.trim()) {
    e.address_line1 = "Enter address line 1.";
  }
  if (!draft.address_town.trim()) {
    e.address_town = "Enter your town or city.";
  }
  const pc = draft.address_postcode.trim();
  if (!pc) {
    e.address_postcode = "Enter your UK postcode.";
  } else if (!normalizeUkPostcode(pc)) {
    e.address_postcode = "Enter a valid UK postcode (e.g. SW1A 1AA).";
  }
  return e;
}

function validateStep4(password: string, confirm: string): FieldErrors {
  const e: FieldErrors = {};
  if (!password) {
    e.password = "Enter a password.";
  } else if (password.length < 8) {
    e.password = "Password must be at least 8 characters.";
  }
  if (!confirm) {
    e.confirm_password = "Confirm your password.";
  } else if (password !== confirm) {
    e.confirm_password = "Passwords do not match.";
  }
  return e;
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}

function StepSummaryErrors({ errors }: { errors: FieldErrors }) {
  const entries = Object.entries(errors).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5"
      role="alert"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-red-900">Please fix the following:</p>
      <ul className="mt-1 list-inside list-disc text-sm text-red-800">
        {entries.map(([key, msg]) => (
          <li key={key}>{msg}</li>
        ))}
      </ul>
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-rph-rail text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover disabled:opacity-50"
    >
      {pending ? "Creating account…" : label}
    </button>
  );
}

type Draft = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  address_town: string;
  address_county: string;
  address_postcode: string;
  password: string;
  confirm_password: string;
};

const emptyDraft: Draft = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  email: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  address_town: "",
  address_county: "",
  address_postcode: "",
  password: "",
  confirm_password: "",
};

function StepProgress({ step }: { step: number }) {
  return (
    <nav className="mb-8" aria-label="Sign-up steps">
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
                <li className="mx-1 h-1 min-w-[8px] flex-1 list-none sm:mx-2" aria-hidden>
                  <div
                    className={[
                      "h-full w-full rounded-full transition-colors duration-300",
                      segmentBeforeOrange ? "bg-orange-500" : "bg-zinc-200",
                    ].join(" ")}
                  />
                </li>
              ) : null}
              <li className="flex list-none flex-col items-center">
                <div
                  className={[
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all",
                    done && "border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25",
                    active &&
                      "border-orange-500 bg-white text-orange-600 shadow-md ring-4 ring-orange-100",
                    !done && !active && "border-zinc-200 bg-white text-zinc-400",
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
                    "mt-2 hidden max-w-[5.5rem] text-center text-[11px] font-semibold leading-tight sm:block",
                    active ? "text-orange-700" : done ? "text-zinc-600" : "text-zinc-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-sm font-semibold text-orange-700 sm:hidden">{STEP_LABELS[step - 1]}</p>
    </nav>
  );
}

function inputClasses(invalid: boolean) {
  return [
    "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2",
    invalid
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/25"
      : "border-zinc-300 focus:border-rph-rail focus:ring-rph-rail/20",
  ].join(" ");
}

export function SignUpForm() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [state, formAction] = useActionState(signUpDriverAction, initial);

  const setStepClearErrors = useCallback((n: number) => {
    setFieldErrors({});
    setStep(n);
  }, []);

  const patchDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) {
        delete next[k];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const goNext = useCallback(
    (nextStep: number, errors: FieldErrors) => {
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      setStep(nextStep);
    },
    [],
  );

  const btnContinueSolo =
    "flex h-11 w-full items-center justify-center rounded-lg bg-rph-rail text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover";
  const btnContinueRow =
    "flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg bg-rph-rail text-sm font-semibold text-white shadow-sm hover:bg-rph-rail-hover";
  const btnGhost =
    "flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50";

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (step !== 4) {
      e.preventDefault();
      return;
    }
    const errs = validateStep4(draft.password, draft.confirm_password);
    if (Object.keys(errs).length > 0) {
      e.preventDefault();
      setFieldErrors(errs);
    }
  };

  return (
    <form action={formAction} onSubmit={handleFormSubmit} className="space-y-2">
      <StepProgress step={step} />

      {state.error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4 pt-1">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Your name and date of birth</h2>
            <p className="mt-1 text-sm text-zinc-500">
              We use this to create your driver profile. You must be 18 or older.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="first_name" className="text-sm font-medium text-zinc-700">
                First names
              </label>
              <input
                id="first_name"
                value={draft.first_name}
                onChange={(e) => patchDraft({ first_name: e.target.value })}
                name="first_name"
                autoComplete="given-name"
                className={inputClasses(Boolean(fieldErrors.first_name))}
                aria-invalid={Boolean(fieldErrors.first_name)}
                aria-describedby={fieldErrors.first_name ? "err-first_name" : undefined}
              />
              <FieldError id="err-first_name" message={fieldErrors.first_name} />
            </div>
            <div className="space-y-1">
              <label htmlFor="last_name" className="text-sm font-medium text-zinc-700">
                Last name
              </label>
              <input
                id="last_name"
                value={draft.last_name}
                onChange={(e) => patchDraft({ last_name: e.target.value })}
                name="last_name"
                autoComplete="family-name"
                className={inputClasses(Boolean(fieldErrors.last_name))}
                aria-invalid={Boolean(fieldErrors.last_name)}
                aria-describedby={fieldErrors.last_name ? "err-last_name" : undefined}
              />
              <FieldError id="err-last_name" message={fieldErrors.last_name} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="date_of_birth" className="text-sm font-medium text-zinc-700">
                Date of birth
              </label>
              <input
                id="date_of_birth"
                type="date"
                value={draft.date_of_birth}
                onChange={(e) => patchDraft({ date_of_birth: e.target.value })}
                name="date_of_birth"
                className={inputClasses(Boolean(fieldErrors.date_of_birth))}
                aria-invalid={Boolean(fieldErrors.date_of_birth)}
                aria-describedby={fieldErrors.date_of_birth ? "err-date_of_birth" : undefined}
              />
              <FieldError id="err-date_of_birth" message={fieldErrors.date_of_birth} />
            </div>
          </div>
          <StepSummaryErrors errors={fieldErrors} />
          <button
            type="button"
            className={btnContinueSolo}
            onClick={() => goNext(2, validateStep1(draft))}
          >
            Continue
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 pt-1">
          <input type="hidden" name="first_name" value={draft.first_name} readOnly />
          <input type="hidden" name="last_name" value={draft.last_name} readOnly />
          <input type="hidden" name="date_of_birth" value={draft.date_of_birth} readOnly />
          <div>
            <h2 className="text-base font-semibold text-zinc-900">How we reach you</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Your login email and a phone number for your account.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={draft.email}
                onChange={(e) => patchDraft({ email: e.target.value })}
                name="email"
                autoComplete="email"
                className={inputClasses(Boolean(fieldErrors.email))}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "err-email" : undefined}
              />
              <FieldError id="err-email" message={fieldErrors.email} />
            </div>
            <div className="space-y-1">
              <label htmlFor="phone" className="text-sm font-medium text-zinc-700">
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => patchDraft({ phone: e.target.value })}
                name="phone"
                autoComplete="tel"
                className={inputClasses(Boolean(fieldErrors.phone))}
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? "err-phone" : undefined}
              />
              <FieldError id="err-phone" message={fieldErrors.phone} />
            </div>
          </div>
          <StepSummaryErrors errors={fieldErrors} />
          <div className="mt-2 flex gap-3">
            <button type="button" className={btnGhost} onClick={() => setStepClearErrors(1)}>
              Back
            </button>
            <button type="button" className={btnContinueRow} onClick={() => goNext(3, validateStep2(draft))}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 pt-1">
          <input type="hidden" name="first_name" value={draft.first_name} readOnly />
          <input type="hidden" name="last_name" value={draft.last_name} readOnly />
          <input type="hidden" name="date_of_birth" value={draft.date_of_birth} readOnly />
          <input type="hidden" name="email" value={draft.email} readOnly />
          <input type="hidden" name="phone" value={draft.phone} readOnly />
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Your UK address</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Driving and PHV licence details (and photos) are added after you log in — on the onboarding
              step.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="address_line1" className="text-sm font-medium text-zinc-700">
              Address line 1
            </label>
            <input
              id="address_line1"
              value={draft.address_line1}
              onChange={(e) => patchDraft({ address_line1: e.target.value })}
              name="address_line1"
              autoComplete="address-line1"
              className={inputClasses(Boolean(fieldErrors.address_line1))}
              aria-invalid={Boolean(fieldErrors.address_line1)}
              aria-describedby={fieldErrors.address_line1 ? "err-address_line1" : undefined}
            />
            <FieldError id="err-address_line1" message={fieldErrors.address_line1} />
          </div>
          <div className="space-y-1">
            <label htmlFor="address_line2" className="text-sm font-medium text-zinc-700">
              Address line 2 (optional)
            </label>
            <input
              id="address_line2"
              value={draft.address_line2}
              onChange={(e) => patchDraft({ address_line2: e.target.value })}
              name="address_line2"
              autoComplete="address-line2"
              className={inputClasses(false)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="address_town" className="text-sm font-medium text-zinc-700">
                Town / city
              </label>
              <input
                id="address_town"
                value={draft.address_town}
                onChange={(e) => patchDraft({ address_town: e.target.value })}
                name="address_town"
                autoComplete="address-level2"
                className={inputClasses(Boolean(fieldErrors.address_town))}
                aria-invalid={Boolean(fieldErrors.address_town)}
                aria-describedby={fieldErrors.address_town ? "err-address_town" : undefined}
              />
              <FieldError id="err-address_town" message={fieldErrors.address_town} />
            </div>
            <div className="space-y-1">
              <label htmlFor="address_county" className="text-sm font-medium text-zinc-700">
                County (optional)
              </label>
              <input
                id="address_county"
                value={draft.address_county}
                onChange={(e) => patchDraft({ address_county: e.target.value })}
                name="address_county"
                autoComplete="address-level1"
                className={inputClasses(false)}
              />
            </div>
            <div className="space-y-1 sm:max-w-xs">
              <label htmlFor="address_postcode" className="text-sm font-medium text-zinc-700">
                UK postcode
              </label>
              <input
                id="address_postcode"
                value={draft.address_postcode}
                onChange={(e) => patchDraft({ address_postcode: e.target.value })}
                name="address_postcode"
                autoComplete="postal-code"
                placeholder="e.g. SW1A 1AA"
                className={inputClasses(Boolean(fieldErrors.address_postcode))}
                aria-invalid={Boolean(fieldErrors.address_postcode)}
                aria-describedby={fieldErrors.address_postcode ? "err-address_postcode" : undefined}
              />
              <FieldError id="err-address_postcode" message={fieldErrors.address_postcode} />
            </div>
          </div>
          <StepSummaryErrors errors={fieldErrors} />
          <div className="mt-2 flex gap-3">
            <button type="button" className={btnGhost} onClick={() => setStepClearErrors(2)}>
              Back
            </button>
            <button type="button" className={btnContinueRow} onClick={() => goNext(4, validateStep3(draft))}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4 pt-1">
          <input type="hidden" name="first_name" value={draft.first_name} readOnly />
          <input type="hidden" name="last_name" value={draft.last_name} readOnly />
          <input type="hidden" name="date_of_birth" value={draft.date_of_birth} readOnly />
          <input type="hidden" name="email" value={draft.email} readOnly />
          <input type="hidden" name="phone" value={draft.phone} readOnly />
          <input type="hidden" name="address_line1" value={draft.address_line1} readOnly />
          <input type="hidden" name="address_line2" value={draft.address_line2} readOnly />
          <input type="hidden" name="address_town" value={draft.address_town} readOnly />
          <input type="hidden" name="address_county" value={draft.address_county} readOnly />
          <input type="hidden" name="address_postcode" value={draft.address_postcode} readOnly />
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Choose a password</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Last step — we&apos;ll create your account and send you to log in.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) => patchDraft({ password: e.target.value })}
                className={inputClasses(Boolean(fieldErrors.password))}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "err-password" : undefined}
              />
              <FieldError id="err-password" message={fieldErrors.password} />
              <p className="text-xs text-zinc-500">At least 8 characters.</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm_password" className="text-sm font-medium text-zinc-700">
                Confirm password
              </label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                value={draft.confirm_password}
                onChange={(e) => patchDraft({ confirm_password: e.target.value })}
                className={inputClasses(Boolean(fieldErrors.confirm_password))}
                aria-invalid={Boolean(fieldErrors.confirm_password)}
                aria-describedby={fieldErrors.confirm_password ? "err-confirm_password" : undefined}
              />
              <FieldError id="err-confirm_password" message={fieldErrors.confirm_password} />
            </div>
          </div>
          <StepSummaryErrors errors={fieldErrors} />
          <div className="mt-2 flex gap-3">
            <button type="button" className={btnGhost} onClick={() => setStepClearErrors(3)}>
              Back
            </button>
          </div>
          <Submit label="Create driver account" />
        </div>
      ) : null}
    </form>
  );
}
