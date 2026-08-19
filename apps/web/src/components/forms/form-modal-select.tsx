"use client";

import { RphSelect, rphSelectTriggerClass } from "@/components/forms/rph-select";

const modalSelectContentBase =
  "max-h-[min(16rem,50vh)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

/** z-[320] — above FormModalShell (310). */
export const formModalSelectContentClass = `z-[320] ${modalSelectContentBase}`;

/** z-[420] — above custom overlays that sit above FormModalShell. */
export const elevatedModalSelectContentClass = `z-[420] ${modalSelectContentBase}`;

export function FormModalSelect({
  value,
  onValueChange,
  disabled,
  placeholder,
  options,
  "aria-label": ariaLabel,
  triggerClassName,
  contentClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  "aria-label"?: string;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  return (
    <RphSelect
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      placeholder={placeholder}
      options={options}
      aria-label={ariaLabel}
      triggerClassName={triggerClassName ?? rphSelectTriggerClass}
      contentClassName={contentClassName ?? formModalSelectContentClass}
    />
  );
}
