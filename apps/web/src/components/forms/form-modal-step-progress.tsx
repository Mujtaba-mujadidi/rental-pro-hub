"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";

type Props = {
  /** Zero-based active step index. */
  step: number;
  labels: readonly string[];
  ariaLabel?: string;
};

/** Orange circular step indicator used in multi-step `FormModalShell` modals. */
export function FormModalStepProgress({ step, labels, ariaLabel = "Form steps" }: Props) {
  const displayStep = step + 1;

  return (
    <nav className="mb-2" aria-label={ariaLabel}>
      <p className="rph-meta mb-4 text-center font-medium uppercase tracking-wide">
        Step {displayStep} of {labels.length}
      </p>
      <ol className="flex w-full items-center px-0.5 sm:px-2">
        {labels.map((label, i) => {
          const n = i + 1;
          const done = n < displayStep;
          const active = n === displayStep;
          const segmentBeforeOrange = i > 0 && displayStep > i;

          return (
            <Fragment key={label}>
              {i > 0 ? (
                <li className="mx-1 h-1 min-w-[8px] flex-1 list-none sm:mx-2" aria-hidden>
                  <div
                    className={[
                      "h-full w-full rounded-full transition-colors duration-300",
                      segmentBeforeOrange ? "bg-orange-500" : "bg-rph-border",
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
                      "border-orange-500 bg-rph-raised text-orange-600 shadow-md ring-4 ring-orange-100 dark:text-orange-500 dark:ring-orange-950/40",
                    !done &&
                      !active &&
                      "border-rph-border bg-rph-raised text-rph-fg-muted",
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
                    active ? "text-orange-700 dark:text-orange-400" : done ? "text-rph-fg-secondary" : "text-rph-fg-muted",
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
        {labels[step]}
      </p>
    </nav>
  );
}

export function FormModalField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={["block space-y-1", className].filter(Boolean).join(" ")}>
      <span className="text-xs font-medium text-rph-fg-muted">{label}</span>
      {children}
    </label>
  );
}
