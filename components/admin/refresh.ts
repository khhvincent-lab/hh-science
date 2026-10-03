"use client";

import { useEffect } from "react";

const eventName = "hh-admin-refresh";
type RefreshEvent = CustomEvent<Promise<unknown>[]>;

// Mounted data panels join the same refresh and keep their local filter state.
export function listenAdminRefresh(load: () => Promise<unknown>) {
  const listener = (event: Event) => {
    (event as RefreshEvent).detail.push(Promise.resolve().then(load));
  };
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

export function useAdminRefresh(load: () => Promise<unknown>, enabled = true) {
  useEffect(() => enabled ? listenAdminRefresh(load) : undefined, [load, enabled]);
}

export async function refreshAdminPanels() {
  const tasks: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent(eventName, { detail: tasks }));
  await Promise.all(tasks);
}
