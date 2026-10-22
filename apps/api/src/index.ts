import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./env";
import { requireAuth } from "./lib/auth";
import { ApiError } from "./lib/errors";
import accounting from "./routes/accounting";
import alerts from "./routes/alerts";
import ai from "./routes/ai";
import fixedAssets from "./routes/fixed-assets";
import bankStatements from "./routes/bank-statements";
import audit from "./routes/audit";
import auth from "./routes/auth";
import catalog from "./routes/catalog";
import customers from "./routes/customers";
import expenses from "./routes/expenses";
import { filesPublic, uploads } from "./routes/files";
import { gateway, gatewayWebhook } from "./routes/gateway";
import giftCards from "./routes/gift-cards";
import heldSales from "./routes/held-sales";
import inventory from "./routes/inventory";
import billing from "./routes/billing";
import payments from "./routes/payments";
import platform from "./routes/platform";
import publicRoutes from "./routes/public";
import products from "./routes/products";
import promotions from "./routes/promotions";
import purchaseReturns from "./routes/purchase-returns";
import purchases from "./routes/purchases";
import quotations from "./routes/quotations";
import reports from "./routes/reports";
import returns from "./routes/returns";
import sales from "./routes/sales";
import settings from "./routes/settings";
import shifts from "./routes/shifts";
import suppliers from "./routes/suppliers";
import users from "./routes/users";

const api = new Hono<AppEnv>();

api.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
api.use("*", async (c, next) => {
  const allowed = (c.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })(c, next);
});

api.get("/health", (c) => c.json({ ok: true, time: Date.now() }));

// Public
api.route("/auth", auth);
api.route("/files", filesPublic);
api.route("/gateway", gatewayWebhook);
api.route("/public", publicRoutes);
api.route("/platform", platform);

// Authenticated
const secured = new Hono<AppEnv>();
secured.use("*", requireAuth);
secured.route("/uploads", uploads);
secured.route("/settings", settings);
secured.route("/users", users);
secured.route("/", catalog); // /categories, /brands, /units
secured.route("/products", products);
secured.route("/promotions", promotions);
secured.route("/inventory", inventory);
secured.route("/customers", customers);
secured.route("/suppliers", suppliers);
secured.route("/sales", sales);
secured.route("/returns", returns);
secured.route("/quotations", quotations);
secured.route("/held-sales", heldSales);
secured.route("/purchases", purchases);
secured.route("/purchase-returns", purchaseReturns);
secured.route("/payments", payments);
secured.route("/gateway", gateway);
secured.route("/billing", billing);
secured.route("/expenses", expenses);
secured.route("/ai", ai);
secured.route("/shifts", shifts);
secured.route("/gift-cards", giftCards);
secured.route("/accounting/fixed-assets", fixedAssets);
secured.route("/accounting/bank-statements", bankStatements);
secured.route("/accounting", accounting);
secured.route("/alerts", alerts);
secured.route("/reports", reports);
secured.route("/audit-logs", audit);
api.route("/", secured);

api.notFound((c) => c.json({ error: { code: "not_found", message: "Endpoint not found" } }, 404));

api.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as ContentfulStatusCode,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/UNIQUE constraint failed/i.test(message)) {
    return c.json({ error: { code: "conflict", message: "A record with the same unique value already exists" } }, 409);
  }
  console.error("Unhandled error", err);
  return c.json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, 500);
});

const app = new Hono<AppEnv>();
app.route("/api", api);

// Everything else is the Next.js static export (Workers Static Assets).
app.all("*", async (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text("Not found", 404);
});

export default app;
