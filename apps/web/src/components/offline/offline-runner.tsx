"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { useOnline } from "@/hooks/use-offline";
import { invalidatePaths } from "@/hooks/use-api";
import { ApiError, api } from "@/lib/api";
import { CATALOG_MAX_AGE, downloadCatalog, loadCatalog } from "@/lib/offline-catalog";
import { outboxAll, outboxDel, outboxPut } from "@/lib/offline-db";
import { registerOfflineShell } from "@/lib/offline-sw";

/** Everything a synced sale changes. */
const AFTER_SYNC = ["/sales", "/customers", "/products", "/inventory", "/reports", "/shifts", "/payments", "/gift-cards"];

/** Fire to make the runner try the outbox right away (e.g. the "Retry" button). */
export const syncNow = () => window.dispatchEvent(new Event("sb-sync"));

/**
 * Renders nothing. While a signed-in page is open it (1) saves the app shell for offline use, (2) keeps a fresh copy
 * of the sellable catalog on this device, and (3) sends queued offline sales to the server whenever it can.
 */
export function OfflineRunner() {
  const { business, user, locationId, can } = useSession();
  const online = useOnline();
  const qc = useQueryClient();
  const selling = can("pos.sell");
  const running = React.useRef(false);

  const refreshCatalog = React.useCallback(
    async (force = false) => {
      if (!selling || !locationId) return;
      try {
        const saved = await loadCatalog(business.id, locationId);
        if (force || !saved || Date.now() - saved.savedAt > CATALOG_MAX_AGE) await downloadCatalog(business.id, locationId);
      } catch {
        /* keep whatever copy we already have */
      }
    },
    [business.id, locationId, selling],
  );

  const flush = React.useCallback(async () => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    let synced = 0;
    try {
      const rows = (await outboxAll()).filter((r) => r.businessId === business.id && r.userId === user.id && r.status === "pending");
      for (const row of rows) {
        try {
          await api.post("/sales/checkout", row.body);
          await outboxDel(row.ref);
          synced++;
        } catch (e) {
          // No connection, signed out, busy or server trouble: leave it queued and try again later.
          if (!(e instanceof ApiError) || e.status === 0 || e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500) break;
          await outboxPut({ ...row, status: "failed", error: e.message, attempts: row.attempts + 1 });
        }
      }
    } finally {
      running.current = false;
    }
    if (synced > 0) {
      toast.success(`${synced} offline sale${synced === 1 ? "" : "s"} synced`);
      await invalidatePaths(qc, AFTER_SYNC);
      void refreshCatalog(true);
    }
  }, [business.id, user.id, qc, refreshCatalog]);

  React.useEffect(() => {
    void registerOfflineShell(selling ? ["/pos"] : []);
  }, [selling]);

  React.useEffect(() => {
    if (!online) return;
    void refreshCatalog();
    void flush();
    const t = setInterval(() => {
      void flush();
      void refreshCatalog();
    }, 30_000);
    return () => clearInterval(t);
  }, [online, refreshCatalog, flush]);

  React.useEffect(() => {
    const on = () => void flush();
    window.addEventListener("sb-sync", on);
    return () => window.removeEventListener("sb-sync", on);
  }, [flush]);

  return null;
}
