"use client";

import * as Select from "@radix-ui/react-select";

const triggerClass =
  "rph-input flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 text-left outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-rph-fg-muted";

/** z-[320] — above FormModalShell (310). */
const contentClass =
  "z-[320] max-h-[min(16rem,50vh)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const itemClass =
  "relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm text-rph-fg outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-rph-chrome data-[highlighted]:text-rph-fg";

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function FormModalSelect({
  value,
  onValueChange,
  disabled,
  placeholder,
  options,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
  "aria-label"?: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger className={triggerClass} aria-label={ariaLabel}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="shrink-0 text-rph-fg-muted">
          <IconChevronDown />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={contentClass}
        >
          <Select.Viewport className="p-1">
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value} className={itemClass}>
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center text-rph-fg-muted">
                  <Select.ItemIndicator>
                    <IconCheck />
                  </Select.ItemIndicator>
                </span>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
