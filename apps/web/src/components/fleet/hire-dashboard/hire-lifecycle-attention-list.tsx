"use client";

import type { HireLifecycleAttentionItem } from "@/lib/fleet/hire-lifecycle-attention";
import { lifecycleAttentionLabel } from "@/lib/fleet/hire-lifecycle-attention";
import Link from "next/link";

export function HireLifecycleAttentionList({ items }: { items: HireLifecycleAttentionItem[] }) {
  if (!items.length) return null;

  return (
    <section className="rph-card p-4">
      <h2 className="text-sm font-semibold text-rph-fg">Hire workflow</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.kind}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">
                {lifecycleAttentionLabel(item.kind)}
              </p>
              <p className="font-medium text-rph-fg">{item.title}</p>
              <p className="rph-muted mt-0.5 text-xs">{item.detail}</p>
            </div>
            <Link href={item.href} className="rph-btn-primary shrink-0 px-3 py-1.5 text-xs">
              Open
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
