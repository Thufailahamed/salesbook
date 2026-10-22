import type { CheckoutInput } from "@shopbooks/shared";

/**
 * Tiny IndexedDB wrapper for offline selling: a key/value store (cached session, catalog, shift) and the outbox of
 * sales rung up without a connection. Every function resolves harmlessly when IndexedDB is unavailable
 * (private mode, SSR), so the app simply behaves as online-only there.
 */

const DB_NAME = "shopbooks-offline";
const KV = "kv";
const OUTBOX = "outbox";

/** A sale waiting to be sent to the server. */
export interface OutboxSale {
  /** The checkout's clientRef: the idempotency key and this record's key. */
  ref: string;
  businessId: string;
  userId: string;
  createdAt: number;
  body: CheckoutInput;
  /** Enough to show and print a provisional receipt without the server. */
  summary: {
    total: number;
    change: number;
    itemCount: number;
    customerName: string | null;
    lines: { name: string; quantity: number; unitPrice: number; total: number }[];
    payments: { label: string; amount: number }[];
  };
  status: "pending" | "failed";
  error?: string;
  attempts: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(KV);
        req.result.createObjectStore(OUTBOX, { keyPath: "ref" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const kvGet = <T>(key: string) => run<T>(KV, "readonly", (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => run(KV, "readwrite", (s) => s.put(value, key));
export const kvDel = (key: string) => run(KV, "readwrite", (s) => s.delete(key));

const notify = () => typeof window !== "undefined" && window.dispatchEvent(new Event("sb-outbox"));

export async function outboxAll(): Promise<OutboxSale[]> {
  const rows = (await run<OutboxSale[]>(OUTBOX, "readonly", (s) => s.getAll())) ?? [];
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}
export async function outboxPut(sale: OutboxSale) {
  await run(OUTBOX, "readwrite", (s) => s.put(sale));
  notify();
}
export async function outboxDel(ref: string) {
  await run(OUTBOX, "readwrite", (s) => s.delete(ref));
  notify();
}

/** Forget everything cached for this device (on sign-out). Queued sales are kept: they still belong to the shop. */
export async function clearOfflineCache() {
  await run(KV, "readwrite", (s) => s.clear());
}
