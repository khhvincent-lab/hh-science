"use client";
import { useEffect, useState } from "react";

// Keep a closing popup mounted just long enough to finish its exit animation.
export function usePanelPresence(open: boolean) {
  const [retained, setRetained] = useState(open);
  if (open && !retained) setRetained(true);
  useEffect(() => {
    if (open) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    const timer = window.setTimeout(() => setRetained(false), delay);
    return () => window.clearTimeout(timer);
  }, [open]);
  return open || retained;
}
