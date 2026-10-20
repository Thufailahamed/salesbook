import type { ApiErrorBody } from "@shopbooks/shared";

export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const API_BASE = `${API_ORIGIN}/api`;

export type Query = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `${url}?${s}` : url;
}

let redirecting = false;
function handleUnauthorized(path: string) {
  if (typeof window === "undefined" || path.startsWith("/auth/")) return;
  if (redirecting) return;
  const here = window.location.pathname;
  if (here.startsWith("/login") || here.startsWith("/signup")) return;
  redirecting = true;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, credentials: "include" });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    if (res.status === 401) handleUnauthorized(path);
    throw new ApiError(
      res.status,
      err?.code ?? (res.status === 401 ? "unauthorized" : "error"),
      err?.message ?? (typeof data === "string" && data ? data.slice(0, 200) : `Request failed (${res.status})`),
      err?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body: body ?? {} }),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string; key: string }>("POST", "/uploads", { form });
  },
};

/**
 * Resolve an asset URL returned by the API. Product images / logos come back relative ("/api/files/<key>");
 * in dev the API runs on another origin, so those are prefixed with NEXT_PUBLIC_API_URL. Absolute, data: and
 * blob: URLs are returned unchanged.
 */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/")) return `${API_ORIGIN}${url}`;
  return url;
}

/** Alias of assetUrl (kept for compatibility). */
export const fileUrl = assetUrl;

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
