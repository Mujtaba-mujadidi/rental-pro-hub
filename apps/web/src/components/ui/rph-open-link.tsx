import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function OpenChevron({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type RphOpenLinkProps = Omit<ComponentProps<typeof Link>, "className" | "children"> & {
  children?: ReactNode;
  className?: string;
  size?: "sm" | "md";
  /** When true, appends the screenshot chevron after the label. */
  withChevron?: boolean;
};

/** Sky-blue text action used for card/panel “Open” links (matches portfolio screenshots). */
export function RphOpenLink({
  children = "Open",
  className = "",
  size = "md",
  withChevron = true,
  ...props
}: RphOpenLinkProps) {
  const base = size === "sm" ? "rph-open-link-sm" : "rph-open-link";
  return (
    <Link {...props} className={`${base} ${className}`.trim()}>
      {children}
      {withChevron ? <OpenChevron /> : null}
    </Link>
  );
}
