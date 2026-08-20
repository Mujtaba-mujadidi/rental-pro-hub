"use client";

import { useEffect } from "react";

const SCROLL_ROOT_SELECTOR = "[data-rph-scroll-root]";

let lockCount = 0;
const previousOverflow = new Map<HTMLElement, string>();

function lockTargets(): HTMLElement[] {
  const targets: HTMLElement[] = [document.documentElement, document.body];
  document.querySelectorAll<HTMLElement>(SCROLL_ROOT_SELECTOR).forEach((el) => targets.push(el));
  return targets;
}

function applyLock() {
  for (const el of lockTargets()) {
    if (previousOverflow.has(el)) continue;
    previousOverflow.set(el, el.style.overflow);
    el.style.overflow = "hidden";
  }
}

function releaseLock() {
  for (const [el, value] of previousOverflow) {
    el.style.overflow = value;
  }
  previousOverflow.clear();
}

/** Prevent page/shell scrolling while a modal is open (ref-counted for nested dialogs). */
export function acquireBackgroundScrollLock(): () => void {
  lockCount += 1;
  if (lockCount === 1) applyLock();
  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) releaseLock();
  };
}

export function useLockBackgroundScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    return acquireBackgroundScrollLock();
  }, [locked]);
}
