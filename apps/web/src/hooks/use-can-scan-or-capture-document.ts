"use client";

import { useEffect, useState } from "react";

/**
 * Detect phones/tablets where a camera capture input is useful for document photos.
 * True document OCR/edge-scan is OS-native (e.g. iOS “Scan Documents” in the file sheet);
 * we surface a dedicated camera capture control when the device can use it.
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
