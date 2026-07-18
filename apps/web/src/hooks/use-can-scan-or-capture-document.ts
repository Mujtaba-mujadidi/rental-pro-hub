"use client";

import { useEffect, useState } from "react";

/**
 * Detect phones/tablets where camera / system document-scan sheet options are useful.
 *
 * Browsers cannot force iOS “Scan Documents” directly. Without `capture`, the system
 * file sheet may offer Scan Documents (edge crop, multi-page). With `capture`, only
 * the camera opens (one image per open).
 */
export function useCanScanOrCaptureDocument(): boolean {
  const [can, setCan] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent || "";
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const coarsePointer =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const touchPoints = (navigator.maxTouchPoints ?? 0) > 0;
    const hasMediaDevices = typeof navigator.mediaDevices?.getUserMedia === "function";

    // Prefer real mobile/tablet signals; avoid showing camera CTA on desktop with a webcam.
    const isPhoneOrTablet = mobileUa || (coarsePointer && touchPoints && window.innerWidth < 1024);
    setCan(Boolean(isPhoneOrTablet && (hasMediaDevices || mobileUa)));
  }, []);

  return can;
}
