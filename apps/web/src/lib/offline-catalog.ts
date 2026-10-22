import type { SellableItem } from "@shopbooks/shared";
import { api } from "@/lib/api";
import { kvGet, kvSet } from "@/lib/offline-db";

/** The sellable catalog of one location, kept in IndexedDB so the POS can search and scan without a connection. */
export interface SavedCatalog {
  items: SellableItem[];
  savedAt: number;
}

const PAGE = 200;
const MAX_ITEMS = 20_000;
export const CATALOG_MAX_AGE = 10 * 60_000;

export const catalogKey = (businessId: string, locationId: string) => `catalog:${businessId}:${locationId}`;

const notify = () => typeof window !== "undefined" && window.dispatchEvent(new Event("sb-catalog"));

export async function loadCatalog(businessId: string, locationId: string): Promise<SavedCatalog | null> {
  return (await kvGet<SavedCatalog>(catalogKey(businessId, locationId))) ?? null;
}

/** Download every active variant for the location (200 per request) and save it. */
export async function downloadCatalog(businessId: string, locationId: string): Promise<SavedCatalog> {
  const items: SellableItem[] = [];
  for (let offset = 0; offset < MAX_ITEMS; offset += PAGE) {
    const page = await api.get<SellableItem[]>("/products/sellable", { locationId, limit: PAGE, offset });
    items.push(...page);
    if (page.length < PAGE) break;
  }
  const saved = { items, savedAt: Date.now() };
  await kvSet(catalogKey(businessId, locationId), saved);
  notify();
  return saved;
}

/** After an offline sale, take the sold quantities off the saved stock so the same units aren't sold twice. */
export async function reduceCatalogStock(businessId: string, locationId: string, sold: { variantId: string | null; quantity: number }[]) {
  const saved = await loadCatalog(businessId, locationId);
  if (!saved) return;
  const qty = new Map<string, number>();
  for (const s of sold) if (s.variantId) qty.set(s.variantId, (qty.get(s.variantId) ?? 0) + s.quantity);
  for (const it of saved.items) {
    const q = qty.get(it.variantId);
    if (q && it.trackInventory) it.stock = Math.round((it.stock - q) * 1000) / 1000;
  }
  await kvSet(catalogKey(businessId, locationId), saved);
  notify();
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Same behaviour as the server search: every word must match; exact barcode/SKU first, then names starting with the text. */
export function searchCatalog(items: SellableItem[], q: string, opts: { limit: number; categoryId?: string | null; includeServices?: boolean }): SellableItem[] {
  const term = norm(q.trim());
  const tokens = term.split(/\s+/).filter(Boolean).slice(0, 6);
  const out: { item: SellableItem; rank: number }[] = [];
  for (const it of items) {
    if (opts.categoryId && it.categoryId !== opts.categoryId) continue;
    if (opts.includeServices === false && it.type === "service") continue;
    let rank = 2;
    if (tokens.length) {
      const hay = `${norm(it.productName)} ${norm(it.variantName)} ${norm(it.sku)} ${norm(it.barcode)} ${norm(it.categoryName)}`;
      if (!tokens.every((t) => hay.includes(t))) continue;
      if (norm(it.barcode) === term || norm(it.sku) === term) rank = 0;
      else if (norm(it.productName).startsWith(term)) rank = 1;
    }
    out.push({ item: it, rank });
    if (!tokens.length && out.length >= opts.limit) break; // browsing: the catalog is already name-ordered
  }
  if (tokens.length) out.sort((a, b) => a.rank - b.rank);
  return out.slice(0, opts.limit).map((o) => o.item);
}

export function findByCode(items: SellableItem[], code: string): SellableItem | null {
  const c = norm(code.trim());
  if (!c) return null;
  return items.find((i) => norm(i.barcode) === c) ?? items.find((i) => norm(i.sku) === c) ?? null;
}
