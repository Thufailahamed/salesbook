#!/usr/bin/env node
/**
 * One-command production deploy to Cloudflare.
 *   node scripts/deploy.mjs [--skip-checks] [--skip-migrations] [--dry-run]      (or: npm run deploy)
 *   --dry-run stops after the build, before anything touches Cloudflare.
 *
 * 1. Preflight: wrangler is logged in and wrangler.jsonc has a real D1 database_id
 * 2. Typecheck shared, API and web (skip with --skip-checks)
 * 3. Build the web static export with NEXT_PUBLIC_API_URL empty (same-origin API), then make sure
 *    no localhost API URL from apps/web/.env.local leaked into the bundle
 * 4. Apply pending D1 migrations to the remote database (skip with --skip-migrations)
 * 5. wrangler deploy (Worker + static assets)
 * 6. Smoke-test the deployed URL: home page, login page and a public API endpoint
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps/api");
const outDir = join(root, "apps/web/out");
const args = new Set(process.argv.slice(2));
const skipChecks = args.has("--skip-checks");
const skipMigrations = args.has("--skip-migrations");
const dryRun = args.has("--dry-run");

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
let stepNo = 0;
const step = (title) => console.log(`\n${bold(`[${++stepNo}] ${title}`)}`);
function fail(message) {
  console.error(`\n${red("✗ Deploy stopped:")} ${message}`);
  process.exit(1);
}

/** Runs a command, streaming its output, and resolves with that output. Rejects on a non-zero exit. */
function run(cmd, cmdArgs, { cwd = root, env = {}, quiet = false } = {}) {
  return new Promise((ok, ko) => {
    const child = spawn(cmd, cmdArgs, {
      cwd,
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const tee = (stream) => (d) => {
      output += d;
      if (!quiet) stream.write(d);
    };
    child.stdout.on("data", tee(process.stdout));
    child.stderr.on("data", tee(process.stderr));
    child.on("error", ko);
    child.on("close", (code) => (code === 0 ? ok(output) : ko(new Error(`${cmd} ${cmdArgs.join(" ")} exited with ${code}`))));
  });
}
const npx = (a, o) => run("npx", a, o);
const npm = (a, o) => run("npm", a, o);

function filesUnder(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

async function main() {
  const started = Date.now();

  step("Preflight");
  try {
    const who = await npx(["wrangler", "whoami"], { cwd: apiDir, quiet: true });
    if (/not authenticated/i.test(who)) throw new Error("not logged in");
    console.log(`  ${green("✓")} wrangler is logged in`);
  } catch {
    fail("wrangler isn't logged in. Run `npx wrangler login` and try again.");
  }
  const config = readFileSync(join(apiDir, "wrangler.jsonc"), "utf8");
  const dbId = config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
  if (!dbId || /^0{8}-/.test(dbId)) {
    fail("apps/api/wrangler.jsonc has no D1 database_id. Run `npx wrangler d1 create shopbooks-db` and paste the id in.");
  }
  console.log(`  ${green("✓")} D1 database ${dbId}`);

  if (skipChecks) {
    step("Typecheck (skipped)");
  } else {
    step("Typecheck");
    await npx(["tsc", "--noEmit", "-p", "packages/shared"]);
    await npx(["tsc", "--noEmit", "-p", "apps/api"]);
    await npm(["run", "typecheck", "-w", "@shopbooks/web"]);
    console.log(`  ${green("✓")} shared, api and web typecheck`);
  }

  step("Build web (same-origin API)");
  // An explicit empty value wins over apps/web/.env.local, which points at the local dev API.
  await npm(["run", "build", "-w", "@shopbooks/web"], { env: { NEXT_PUBLIC_API_URL: "" } });
  if (!existsSync(join(outDir, "index.html"))) fail("the web build produced no apps/web/out/index.html");
  const leaked = filesUnder(outDir).filter((f) => /\.(html|js|txt)$/.test(f) && /localhost:\d{4}|127\.0\.0\.1:\d{4}/.test(readFileSync(f, "utf8")));
  if (leaked.length) fail(`the build still points at a local API (${leaked.length} files, e.g. ${leaked[0].replace(root + "/", "")}).`);
  console.log(`  ${green("✓")} static export ready, no localhost API URLs`);

  if (dryRun) {
    console.log(`\n${green(bold("✓ Dry run complete"))} — ready to deploy. Run without --dry-run to migrate and deploy.`);
    return;
  }

  if (skipMigrations) {
    step("Remote migrations (skipped)");
  } else {
    step("Remote D1 migrations");
    // CI=1 answers wrangler's "apply these migrations?" prompt.
    await npx(["wrangler", "d1", "migrations", "apply", "shopbooks-db", "--remote"], { cwd: apiDir, env: { CI: "1" } });
  }

  step("Deploy Worker");
  const out = await npx(["wrangler", "deploy"], { cwd: apiDir });
  const url = out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];

  step("Smoke test");
  if (!url) {
    console.log("  No workers.dev URL in the deploy output (custom domain only?) — skipping.");
  } else {
    const checks = [
      ["/", (r, t) => r.status === 200 && t.includes("<title>")],
      ["/login", (r) => r.status === 200],
      ["/api/public/plans", (r, t) => r.status === 200 && t.startsWith("{")],
    ];
    let bad = 0;
    for (const [path, test] of checks) {
      try {
        const res = await fetch(url + path);
        const text = await res.text();
        const good = test(res, text);
        if (!good) bad++;
        console.log(`  ${good ? green("✓") : red("✗")} ${path} → ${res.status}`);
      } catch (e) {
        bad++;
        console.log(`  ${red("✗")} ${path} → ${e.message}`);
      }
    }
    if (bad) fail(`${bad} smoke check(s) failed against ${url}. The new version IS deployed — check \`npx wrangler tail\`.`);
  }

  console.log(`\n${green(bold("✓ Deployed"))}${url ? ` → ${url}` : ""} in ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => fail(e.message));
