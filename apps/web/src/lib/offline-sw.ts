/**
 * Registers the offline-shell service worker (production builds only: in dev its caching would fight hot reload) and
 * asks it to save the point of sale plus every script/style this page has loaded.
 */
export async function registerOfflineShell(pages: string[]) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const reg = await navigator.serviceWorker.ready;
    const files = performance
      .getEntriesByType("resource")
      .map((e) => new URL(e.name, location.href))
      .filter((u) => u.origin === location.origin && u.pathname.startsWith("/_next/static/"))
      .map((u) => u.pathname);
    reg.active?.postMessage({ type: "cache", pages, files });
  } catch {
    /* no service worker (private window, http): the app just needs a connection */
  }
}
