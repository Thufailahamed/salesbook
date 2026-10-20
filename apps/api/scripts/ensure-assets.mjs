// wrangler requires the assets directory to exist; create a tiny placeholder when the web app hasn't been built yet.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/out");
if (!existsSync(resolve(out, "index.html"))) {
  mkdirSync(out, { recursive: true });
  writeFileSync(
    resolve(out, "index.html"),
    "<!doctype html><meta charset=utf-8><title>ShopBooks API</title><p>API is running. Start the web app with <code>npm run dev:web</code> or build it with <code>npm run build</code>.</p>",
  );
}
