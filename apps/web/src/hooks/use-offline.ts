"use client";

import * as React from "react";
import { getReachable, subscribe } from "@/lib/connectivity";
import { loadCatalog, type SavedCatalog } from "@/lib/offline-catalog";
import { outboxAll, type OutboxSale } from "@/lib/offline-db";

/** True when the browser has a network AND the server answered its last request. */
export function useOnline(): boolean {
  const reachable = React.useSyncExternalStore(subscribe, getReachable, () => true);
  const [navOnline, setNavOnline] = React.useState(true);
  React.useEffect(() => {
    setNavOnline(navigator.onLine);
    const on = () => setNavOnline(true);
    const off = () => setNavOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return navOnline && reachable;
}

/** Sales waiting in this browser's outbox (live). */
export function useOutbox(): OutboxSale[] {
  const [rows, setRows] = React.useState<OutboxSale[]>([]);
  React.useEffect(() => {
    let alive = true;
    const load = () => void outboxAll().then((r) => alive && setRows(r));
    load();
    window.addEventListener("sb-outbox", load);
    return () => {
      alive = false;
      window.removeEventListener("sb-outbox", load);
    };
  }, []);
  return rows;
}

/** The locally saved catalog for a location (null until one has been downloaded). */
export function useCatalog(businessId: string | undefined, locationId: string | undefined): SavedCatalog | null {
  const [saved, setSaved] = React.useState<SavedCatalog | null>(null);
  React.useEffect(() => {
    if (!businessId || !locationId) return;
    let alive = true;
    const load = () => void loadCatalog(businessId, locationId).then((c) => alive && setSaved(c));
    load();
    window.addEventListener("sb-catalog", load);
    return () => {
      alive = false;
      window.removeEventListener("sb-catalog", load);
    };
  }, [businessId, locationId]);
  return saved;
}
