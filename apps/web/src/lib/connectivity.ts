const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")}/api`;

/**
 * Whether the server is reachable. `navigator.onLine` only knows about the network adapter, so the API client also
 * reports every failed/successful request here; while the server is unreachable we ping /health until it answers.
 */
let reachable = true;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function set(next: boolean) {
  if (next === reachable) return;
  reachable = next;
  listeners.forEach((l) => l());
  if (next) {
    if (timer) clearInterval(timer);
    timer = undefined;
  } else if (!timer && typeof window !== "undefined") {
    timer = setInterval(() => void ping(), 8000);
  }
}

export const reportNetwork = (ok: boolean) => set(ok);

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    set(res.ok);
    return res.ok;
  } catch {
    set(false);
    return false;
  }
}

export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getReachable = () => reachable;
