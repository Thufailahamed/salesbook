import type { Paginated } from "@shopbooks/shared";

export function pageParams(q: { page?: number; pageSize?: number }) {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, q.pageSize ?? 25));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function paged<T>(data: T[], total: number, q: { page: number; pageSize: number }): Paginated<T> {
  return { data, total, page: q.page, pageSize: q.pageSize };
}

/** "" -> null, trims strings; leaves other values untouched. */
export function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      const t = v.trim();
      out[k] = t === "" ? null : t;
    } else out[k] = v;
  }
  return out as T;
}

export const likeQ = (q: string) => `%${q.trim()}%`;
