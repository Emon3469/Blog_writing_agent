"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getHealth, type Health } from "./api";

export type ServerState = "checking" | "waking" | "online" | "offline";

type Snapshot = { state: ServerState; health: Health | null; checkedAt: number };

let snapshot: Snapshot = { state: "checking", health: null, checkedAt: 0 };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function refreshHealth(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const slow = setTimeout(() => set({ state: "waking" }), 2500);
    for (let attempt = 0; attempt < 6; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const health = await getHealth(controller.signal);
        clearTimeout(timeout);
        clearTimeout(slow);
        set({ state: "online", health, checkedAt: Date.now() });
        return;
      } catch {
        clearTimeout(timeout);
        if (attempt === 0) set({ state: "waking" });
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    clearTimeout(slow);
    set({ state: "offline", checkedAt: Date.now() });
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

const SERVER_SNAPSHOT: Snapshot = { state: "checking", health: null, checkedAt: 0 };

export function useServerHealth() {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );

  useEffect(() => {
    if (!snapshot.checkedAt || Date.now() - snapshot.checkedAt > 120000) void refreshHealth();
  }, []);

  return value;
}
