// Platform admin + paid-signup scenario. Needs the API running with apps/api/.dev.vars:
//   PLATFORM_ADMIN_EMAIL=admin@shopbooks.test PLATFORM_ADMIN_PASSWORD=AdminPass#123 PAYMENTS_LK_API=http://localhost:9099/v1
// and runs its own mock of api.payments.lk on :9099.   Usage: node scripts/e2e-platform.mjs http://localhost:8787
import http from "node:http";
import crypto from "node:crypto";

const BASE = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "") + "/api";
const ADMIN = { email: "admin@shopbooks.test", password: "AdminPass#123" };
const SECRET = "sk_test_platform", WH = "whsec_platform";
let passed = 0, failed = 0;
const ok = (c, m) => (c ? (passed++, console.log("  ✓", m)) : (failed++, console.log("  ✗", m)));

// ---- mock payments.lk
const checkouts = new Map();
const mock = http.createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== `Bearer ${SECRET}`) { res.statusCode = 401; return res.end("{}"); }
    if (req.method === "POST" && req.url === "/v1/checkouts") {
      const b = JSON.parse(body); const id = "chk_" + crypto.randomBytes(8).toString("hex");
      checkouts.set(id, { ...b, id, status: "open", paid: false });
      return res.end(JSON.stringify({ id, url: `https://pay.mock/${id}`, status: "open" }));
    }
    const m = req.url.match(/^\/v1\/checkouts\/(.+)$/);
    if (m && checkouts.has(m[1])) {
      const c = checkouts.get(m[1]);
      return res.end(JSON.stringify({ id: c.id, status: c.paid ? "completed" : "open", payment: { id: "pay_" + c.id, status: c.paid ? "succeeded" : "requires_payment_method", amountCents: c.amountCents, reference: c.reference } }));
    }
    res.statusCode = 404; res.end("{}");
  });
});
await new Promise((r) => mock.listen(9099, r));

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
const sign = (raw, secret = WH, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
async function webhook(type, reference, amountCents) {
  const raw = JSON.stringify({ type, data: { reference, amountCents } });
  return call("POST", "/public/webhook", { body: raw, headers: { "payments-signature": sign(raw) } });
}

try {
  console.log("Admin auth");
  ok((await call("GET", "/platform/stats")).status === 401, "admin API rejects anonymous");
  ok((await call("POST", "/platform/auth/login", { body: { email: ADMIN.email, password: "wrong-pass" } })).status === 401, "bad password refused");
  const login = await call("POST", "/platform/auth/login", { body: ADMIN });
  ok(login.status === 200 && login.json.token, "bootstrap admin can sign in");
  const T = login.json.token;
  ok((await call("GET", "/platform/auth/me", { token: T })).json.admin.email === ADMIN.email, "auth/me works");

  console.log("Plans & settings");
  const mk = async (b) => (await call("POST", "/platform/plans", { token: T, body: b })).json;
  const basic = await mk({ name: "Basic", description: "1 store", priceCents: 250000, periodDays: 30, maxUsers: 2, maxLocations: 1 });
  ok(basic.id && basic.priceCents === 250000, "create plan");
  const pro = await mk({ name: "Pro", priceCents: 2500000, periodDays: 365, maxUsers: 0, maxLocations: 0 });
  ok(!!pro.id, "create second plan");
  ok((await call("PUT", `/platform/plans/${pro.id}`, { token: T, body: { name: "Pro", priceCents: 2400000, periodDays: 365, maxUsers: 0, maxLocations: 0 } })).json.priceCents === 2400000, "update plan");
  let s = await call("PUT", "/platform/settings", { token: T, body: { requirePayment: true, isEnabled: false } });
  ok(s.status === 400, "can't require payment while payments are disabled");
  s = await call("PUT", "/platform/settings", { token: T, body: { requirePayment: true, isEnabled: true, secretKey: SECRET, webhookSecret: WH } });
  ok(s.status === 200 && s.json.hasSecretKey && !("secretKey" in s.json) && s.json.mode === "test", "save keys (masked on read)");

  console.log("Public pricing & closed free signup");
  const pub = await call("GET", "/public/plans");
  ok(pub.json.paymentRequired === true && [basic.id, pro.id].every((id) => pub.json.plans.some((p) => p.id === id)), "public plans lists active plans, payment required");
  const free = await call("POST", "/auth/signup", { body: { businessName: "X", name: "X", email: "x@x.co", password: "password123", currency: "LKR", timezone: "Asia/Colombo" } });
  ok(free.status === 402, "free signup is closed (402)");

  console.log("Buy a plan");
  const email = `owner+${Date.now()}@shop.test`;
  const signup = { businessName: "Paid Shop", name: "Paid Owner", email, password: "password123", currency: "LKR", timezone: "Asia/Colombo", taxInclusive: true, defaultTaxRate: 0 };
  const buy = await call("POST", "/public/purchase", { body: { planId: basic.id, signup } });
  ok(buy.status === 201 && buy.json.url?.startsWith("https://pay.mock/"), "purchase returns checkout url");
  const orderId = buy.json.orderId;
  const sent = [...checkouts.values()].at(-1);
  ok(sent.amountCents === 250000 && sent.reference === orderId, "checkout carries plan price + order reference");
  ok((await call("POST", "/auth/login", { body: { email, password: "password123" } })).status === 401, "no shop exists before payment");
  ok((await call("GET", `/public/orders/${orderId}`)).json.status === "pending", "order is pending");

  console.log("Webhook security");
  const raw = JSON.stringify({ type: "payment.succeeded", data: { reference: orderId } });
  ok((await call("POST", "/public/webhook", { body: raw, headers: { "payments-signature": sign(raw, "whsec_wrong") } })).status === 400, "bad signature rejected");
  ok((await call("POST", "/public/webhook", { body: raw, headers: { "payments-signature": sign(raw, WH, Math.floor(Date.now() / 1000) - 3600) } })).status === 400, "stale timestamp rejected");
  let w = await webhook("payment.succeeded", orderId);
  ok(w.json.result === "not succeeded yet", "unpaid checkout is not trusted from payload alone");
  ok((await call("POST", "/auth/login", { body: { email, password: "password123" } })).status === 401, "still no shop");

  console.log("Payment succeeds");
  sent.paid = true;
  w = await webhook("payment.succeeded", orderId);
  ok(w.json.result === "settled", "webhook settles the order");
  ok((await call("GET", `/public/orders/${orderId}`)).json.status === "paid", "order paid");
  ok((await webhook("payment.succeeded", orderId)).json.result === "already settled", "webhook is idempotent");
  const shopLogin = await call("POST", "/auth/login", { body: { email, password: "password123" } });
  ok(shopLogin.status === 200, "customer can sign in with the password they chose");
  const ST = shopLogin.json.token;
  const sub = shopLogin.json.subscription;
  ok(sub?.planName === "Basic" && sub.state === "active" && sub.daysLeft >= 29, "subscription is active on Basic (~30 days)");

  console.log("Plan limits");
  const loc = (n) => call("POST", "/settings/locations", { token: ST, body: { name: n } });
  ok((await loc("Second store")).status === 400, "Basic allows only 1 location");
  const usr = (e) => call("POST", "/users", { token: ST, body: { name: "U", email: e, password: "password123", role: "cashier" } });
  ok((await usr(`u1+${Date.now()}@shop.test`)).status < 300, "second user allowed (limit 2)");
  ok((await usr(`u2+${Date.now()}@shop.test`)).status === 400, "third user blocked by plan");

  console.log("Admin manages the shop");
  const shops = await call("GET", "/platform/shops?q=Paid", { token: T });
  const shop = shops.json.data.find((x) => x.email === email || x.name === "Paid Shop");
  ok(!!shop && shop.planName === "Basic", "shop appears in admin list");
  const detail = await call("GET", `/platform/shops/${shop.id}`, { token: T });
  ok(detail.json.users.length === 2 && detail.json.orders.length === 1, "shop detail has users + orders");
  const stats = await call("GET", "/platform/stats", { token: T });
  ok(stats.json.revenue.total >= 250000 && stats.json.shops.total >= 1, "dashboard stats include the sale");
  const up = await call("PATCH", `/platform/shops/${shop.id}`, { token: T, body: { planId: pro.id } });
  ok(up.json.planName === "Pro", "admin changes plan");
  ok((await loc("Second store")).status < 300, "unlimited plan lifts the location limit");

  console.log("Suspension");
  await call("PATCH", `/platform/shops/${shop.id}`, { token: T, body: { status: "suspended" } });
  ok((await call("GET", "/auth/me", { token: ST })).status === 401 || (await call("GET", "/products", { token: ST })).status === 401, "suspended shop's sessions are revoked");
  const sl = await call("POST", "/auth/login", { body: { email, password: "password123" } });
  ok(sl.status === 403 && sl.json.error.code === "shop_suspended", "suspended shop can't sign in");
  await call("PATCH", `/platform/shops/${shop.id}`, { token: T, body: { status: "active" } });
  const re = await call("POST", "/auth/login", { body: { email, password: "password123" } });
  ok(re.status === 200, "reactivated shop can sign in");
  const ST2 = re.json.token;

  console.log("Expiry & renewal");
  await call("PATCH", `/platform/shops/${shop.id}`, { token: T, body: { subscriptionEndsOn: "2020-01-01" } });
  ok((await call("GET", "/products", { token: ST2 })).status === 402, "expired shop gets 402 on business APIs");
  ok((await call("GET", "/auth/me", { token: ST2 })).json.subscription.state === "expired", "auth/me still works and reports expired");
  const bill = await call("GET", "/billing", { token: ST2 });
  ok(bill.status === 200 && [basic.id, pro.id].every((id) => bill.json.plans.some((p) => p.id === id)) && bill.json.paymentEnabled, "billing page data reachable while expired");
  const ren = await call("POST", "/billing/renew", { token: ST2, body: { planId: basic.id } });
  ok(ren.status === 201, "renewal checkout created");
  const rsent = [...checkouts.values()].at(-1);
  rsent.paid = true;
  ok((await webhook("payment.succeeded", ren.json.orderId)).json.result === "settled", "renewal webhook settles");
  ok((await call("GET", "/products", { token: ST2 })).status === 200, "shop works again after renewing");
  const after = (await call("GET", "/auth/me", { token: ST2 })).json.subscription;
  ok(after.state === "active" && after.daysLeft >= 29 && after.planName === "Basic", "renewal extends from now by the plan period");

  console.log("Shop's own gateway: pay an invoice online");
  const loc0 = (await call("GET", "/auth/me", { token: ST2 })).json;
  const locationId = loc0.locations[0].id;
  const cardMethod = loc0.paymentMethods.find((m) => m.type === "card");
  const cust = await call("POST", "/customers", { token: ST2, body: { name: "Credit Cust", allowCredit: true, creditLimit: 0 } });
  const sale = await call("POST", "/sales/checkout", { token: ST2, body: { locationId, customerId: cust.json.id, lines: [{ name: "Service", quantity: 1, unitPrice: 100000 }], payments: [], allowCredit: true } });
  const inv = sale.json.invoice;
  ok(sale.status < 300 && inv.amountDue === 100000, "credit invoice created (due 1,000.00)");
  ok((await call("GET", "/gateway/status", { token: ST2 })).json.enabled === false, "gateway starts disabled for the shop");
  ok((await call("POST", "/gateway/checkouts", { token: ST2, body: { invoiceId: inv.id } })).status === 400, "can't create checkout while disabled");
  const gs = await call("PUT", "/gateway/settings", { token: ST2, body: { isEnabled: true, secretKey: SECRET, webhookSecret: "whsec_shop", methodId: cardMethod.id } });
  ok(gs.status === 200 && gs.json.webhookUrl.includes(loc0.business.id), "shop saves its own payments.lk keys");
  const co = await call("POST", "/gateway/checkouts", { token: ST2, body: { invoiceId: inv.id } });
  ok(co.status === 200 && co.json.url.startsWith("https://pay.mock/"), "invoice checkout created");
  const shopHook = (type) => { const raw = JSON.stringify({ type, data: { reference: co.json.id } }); return call("POST", `/gateway/webhook/${loc0.business.id}`, { body: raw, headers: { "payments-signature": sign(raw, "whsec_shop") } }); };
  ok((await shopHook("payment.succeeded")).json.result === "not succeeded yet", "invoice stays unpaid until the API confirms");
  [...checkouts.values()].at(-1).paid = true;
  ok((await shopHook("payment.succeeded")).json.result === "settled", "invoice settled by webhook");
  ok((await shopHook("payment.succeeded")).json.result === "already settled", "invoice webhook idempotent");
  const paidInv = await call("GET", `/sales/${inv.id}`, { token: ST2 });
  ok(paidInv.json.amountDue === 0 && paidInv.json.paymentStatus === "paid", "invoice is now paid");
  const cs = await call("GET", `/customers/${cust.json.id}`, { token: ST2 });
  ok(cs.json.dueBalance === 0, "customer balance cleared (ledger moved with payment)");
  const platformSigOnShopHook = JSON.stringify({ type: "payment.succeeded", data: { reference: co.json.id } });
  ok((await call("POST", `/gateway/webhook/${loc0.business.id}`, { body: platformSigOnShopHook, headers: { "payments-signature": sign(platformSigOnShopHook, WH) } })).status === 400, "another account's signing secret is rejected");

  console.log("Failure paths");
  const buy2 = await call("POST", "/public/purchase", { body: { planId: basic.id, signup: { ...signup, email: `b+${Date.now()}@shop.test` } } });
  ok((await webhook("payment.failed", buy2.json.orderId)).json.result === "payment.failed", "failed payment recorded");
  ok((await call("GET", `/public/orders/${buy2.json.orderId}`)).json.status === "failed", "order marked failed");
  ok((await call("POST", "/public/purchase", { body: { planId: basic.id, signup } })).status === 409, "can't buy with an existing email");
  ok((await call("POST", "/public/purchase", { body: { planId: "nope", signup: { ...signup, email: "n@n.co" } } })).status === 400, "unknown plan refused");

  console.log("Admin users");
  const owner = detail.json.users.find((u) => u.role === "owner");
  const pr = await call("PATCH", `/platform/users/${owner.id}`, { token: T, body: { password: "NewPass#12345" } });
  ok(pr.status === 200, "admin resets a shop user's password");
  ok((await call("POST", "/auth/login", { body: { email, password: "NewPass#12345" } })).status === 200, "new password works");
  ok((await call("GET", "/platform/shops", { token: ST2 })).status === 401, "shop tokens can't use the admin API");
  const del = await call("DELETE", `/platform/plans/${basic.id}`, { token: T });
  ok(del.json.deleted === false, "plan in use is deactivated, not deleted");

  // leave the instance open for free signups again (other scripts rely on it)
  ok((await call("PUT", "/platform/settings", { token: T, body: { requirePayment: false, isEnabled: true } })).status === 200, "admin can reopen free signup");
  await call("POST", "/platform/auth/logout", { token: T });
  ok((await call("GET", "/platform/stats", { token: T })).status === 401, "admin logout revokes the session");
} catch (e) {
  failed++; console.log("  ✗ crashed:", e);
}
// provider unreachable: stop the mock, then try to buy
await new Promise((r) => mock.close(r));
try {
  const down = await call("POST", "/public/purchase", { body: { planId: (await (await fetch(BASE + "/public/plans")).json()).plans[0].id, signup: { businessName: "Down", name: "D", email: `d+${Date.now()}@shop.test`, password: "password123", currency: "LKR", timezone: "Asia/Colombo" } } });
  ok(down.status === 400 && /reach payments\.lk/.test(down.json.error?.message), "provider outage gives a clear error (not a 500)");
} catch (e) { failed++; console.log("  ✗", e); }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
