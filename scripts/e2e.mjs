#!/usr/bin/env node
/**
 * End-to-end business scenario test against a running API (e.g. `npm run dev:api`).
 *   node scripts/e2e.mjs [baseUrl]
 * Exercises sales, credit, returns, exchanges, store credit, gift cards, loyalty, purchases,
 * purchase returns, expenses, stock adjustments/transfers, shifts and voids — then checks that
 * the books reconcile (trial balance, balance sheet, sub-ledgers vs control accounts, stock).
 */
const BASE = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "") + "/api";
let token = "";
let failures = 0;
let checks = 0;

async function call(method, path, body, { expectError = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok && !expectError) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  }
  if (res.ok && expectError) throw new Error(`${method} ${path} should have failed but returned ${res.status}`);
  return json;
}
const get = (p) => call("GET", p);
const post = (p, b) => call("POST", p, b ?? {});
const put = (p, b) => call("PUT", p, b);

function check(label, cond, detail) {
  checks++;
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}
const eq = (label, actual, expected) => check(`${label} = ${expected}`, actual === expected, `got ${actual}`);
const step = (s) => console.log(`\n▸ ${s}`);

async function main() {
  step("Sign up");
  const email = `owner+${Date.now()}@example.com`;
  const auth = await post("/auth/signup", {
    businessName: "Thread & Co",
    name: "Owner",
    email,
    password: "password123",
    currency: "LKR",
    timezone: "Asia/Colombo",
    taxInclusive: true,
    defaultTaxRate: 10,
    taxName: "VAT",
  });
  token = auth.token;
  const me = await get("/auth/me");
  const main = me.locations.find((l) => l.isDefault);
  const cash = me.paymentMethods.find((m) => m.type === "cash");
  const card = me.paymentMethods.find((m) => m.type === "card");
  const vat = me.taxRates.find((t) => t.rate === 10);
  check("business created with defaults", !!main && !!cash && !!card && !!vat);

  step("Catalog");
  const cat = await post("/categories", { name: "Tops" });
  const brand = await post("/brands", { name: "House" });
  const tee = await post("/products", {
    name: "Classic Tee",
    type: "standard",
    categoryId: cat.id,
    brandId: brand.id,
    taxRateId: vat.id,
    trackInventory: true,
    hasVariants: true,
    options: [
      { name: "Size", values: ["S", "M"] },
      { name: "Color", values: ["Red", "Blue"] },
    ],
    variants: ["S", "M"].flatMap((size) =>
      ["Red", "Blue"].map((color) => ({
        options: { Size: size, Color: color },
        price: 220000,
        costPrice: 100000,
        openingStock: [{ locationId: main.id, quantity: 10 }],
      })),
    ),
  });
  eq("tee variants", tee.variants.length, 4);
  const v = (size, color) => tee.variants.find((x) => x.options.Size === size && x.options.Color === color);
  const socks = await post("/products", {
    name: "Socks",
    taxRateId: vat.id,
    hasVariants: false,
    variants: [{ options: {}, price: 55000, costPrice: 20000, barcode: "8900001", openingStock: [{ locationId: main.id, quantity: 50 }] }],
  });
  const sock = socks.variants[0];
  const alteration = await post("/products", {
    name: "Alteration",
    type: "service",
    trackInventory: false,
    hasVariants: false,
    variants: [{ options: {}, price: 30000, costPrice: 0 }],
  });
  const lookup = await get(`/products/lookup?code=8900001&locationId=${main.id}`);
  eq("barcode lookup stock", lookup.stock, 50);

  step("Parties");
  const customer = await post("/customers", { name: "Nimal Perera", phone: "0771234567", allowCredit: true, creditLimit: 0, openingBalance: 100000 });
  eq("customer opening due", customer.dueBalance, 100000);
  const supplier = await post("/suppliers", { name: "Textile Hub", paymentTermsDays: 30, openingBalance: 500000 });
  eq("supplier opening due", supplier.dueBalance, 500000);

  step("Cash sale with change (walk-in)");
  const s1 = await post("/sales/checkout", {
    locationId: main.id,
    lines: [
      { variantId: v("S", "Red").id, quantity: 2, unitPrice: 220000 },
      { variantId: sock.id, quantity: 1, unitPrice: 55000 },
      { variantId: alteration.variants[0].id, quantity: 1, unitPrice: 30000 },
    ],
    payments: [{ tender: "method", methodId: cash.id, amount: 525000, tendered: 600000 }],
  });
  eq("sale total", s1.invoice.total, 525000);
  eq("change", s1.change, 75000);
  // 10% inclusive VAT on tees (440000 → 40000) and socks (55000 → 5000); the alteration service has no tax rate.
  eq("tax (inclusive 10%)", s1.invoice.taxTotal, 45000);
  eq("paid status", s1.invoice.paymentStatus, "paid");

  step("Credit sale with partial card payment + line & cart discounts");
  const s2 = await post("/sales/checkout", {
    locationId: main.id,
    customerId: customer.id,
    lines: [
      { variantId: v("M", "Blue").id, quantity: 2, unitPrice: 220000, discountType: "percent", discountValue: 10 },
      { variantId: sock.id, quantity: 2, unitPrice: 55000 },
    ],
    docDiscountType: "amount",
    docDiscountValue: 10000,
    payments: [{ tender: "method", methodId: card.id, amount: 200000, reference: "4242" }],
    allowCredit: true,
  });
  eq("credit sale total", s2.invoice.total, 396000 + 110000 - 10000);
  eq("credit sale due", s2.invoice.amountDue, s2.invoice.total - 200000);
  eq("credit sale status", s2.invoice.paymentStatus, "partial");
  const shortPay = await call(
    "POST",
    "/sales/checkout",
    { locationId: main.id, lines: [{ variantId: sock.id, quantity: 1, unitPrice: 55000 }], payments: [] },
    { expectError: true },
  );
  check("walk-in cannot buy on credit", !!shortPay?.error);

  step("Customer pays on account (FIFO: opening balance first, then invoice, rest becomes advance)");
  const pay = await post(`/customers/${customer.id}/payments`, { amount: 500000, methodId: cash.id });
  eq("payment allocated count", pay.allocations.length, 2);
  let c = await get(`/customers/${customer.id}`);
  eq("customer due after payment", c.dueBalance, 0);
  eq("customer advance credit", c.creditBalance, 500000 - 100000 - (s2.invoice.total - 200000));

  step("Return from cash sale → cash refund, one restocked, one damaged");
  const s1full = await get(`/sales/${s1.invoice.id}`);
  const teeLine = s1full.lines.find((l) => l.variantId === v("S", "Red").id);
  const ret1 = await post("/returns", {
    invoiceId: s1.invoice.id,
    reason: "Wrong size",
    lines: [{ invoiceLineId: teeLine.id, quantity: 1, restock: true }],
    refund: { mode: "method", methodId: cash.id },
  });
  eq("return total", ret1.total, 220000);
  eq("refunded", ret1.refunded, 220000);
  const overReturn = await call(
    "POST",
    "/returns",
    { invoiceId: s1.invoice.id, lines: [{ invoiceLineId: teeLine.id, quantity: 5, restock: true }], refund: { mode: "method", methodId: cash.id } },
    { expectError: true },
  );
  check("cannot return more than sold", !!overReturn?.error);

  step("Exchange: customer returns 1 tee (M/Blue) for 1 tee (S/Blue) + 1 socks, pays difference by card");
  const s2full = await get(`/sales/${s2.invoice.id}`);
  const s2tee = s2full.lines.find((l) => l.variantId === v("M", "Blue").id);
  // Return value = proportional share of the original line (keeps the original discounts & tax).
  const retValue = Math.round(s2tee.net / 2) + Math.round(s2tee.tax / 2);
  const exchangeBody = {
    locationId: main.id,
    customerId: customer.id,
    lines: [
      { variantId: v("S", "Blue").id, quantity: 1, unitPrice: 220000 },
      { variantId: sock.id, quantity: 1, unitPrice: 55000 },
    ],
    returnFrom: { invoiceId: s2.invoice.id, lines: [{ invoiceLineId: s2tee.id, quantity: 1, restock: true }], reason: "Exchange" },
  };
  const unpaid = await call("POST", "/sales/checkout", { ...exchangeBody, payments: [] }, { expectError: true });
  check("exchange difference must be paid", !!unpaid?.error);
  const ex = await post("/sales/checkout", {
    ...exchangeBody,
    payments: [{ tender: "method", methodId: card.id, amount: 275000 - retValue }],
  });
  eq("exchange applied credit", ex.saleReturn.appliedToExchange, retValue);
  eq("exchange invoice paid", ex.invoice.paymentStatus, "paid");

  step("Return to store credit, then spend store credit");
  const s2again = await get(`/sales/${s2.invoice.id}`);
  const s2sock = s2again.lines.find((l) => l.variantId === sock.id);
  const ret2 = await post("/returns", {
    invoiceId: s2.invoice.id,
    lines: [{ invoiceLineId: s2sock.id, quantity: 1, restock: false }],
    refund: { mode: "store_credit" },
  });
  c = await get(`/customers/${customer.id}`);
  const creditBefore = c.creditBalance;
  check("store credit increased by return", ret2.toStoreCredit > 0 && creditBefore >= ret2.toStoreCredit, { ret2: ret2.toStoreCredit, creditBefore });
  const s3 = await post("/sales/checkout", {
    locationId: main.id,
    customerId: customer.id,
    lines: [{ variantId: v("M", "Red").id, quantity: 1, unitPrice: 220000 }],
    payments: [
      { tender: "store_credit", amount: Math.min(creditBefore, 220000) },
      ...(creditBefore < 220000 ? [{ tender: "method", methodId: cash.id, amount: 220000 - creditBefore }] : []),
    ],
  });
  eq("store-credit sale paid", s3.invoice.paymentStatus, "paid");

  step("Gift card: sell, then redeem");
  const gc = await post("/gift-cards", { value: 100000, paid: true, methodId: cash.id });
  eq("gift card balance", gc.balance, 100000);
  await post("/sales/checkout", {
    locationId: main.id,
    lines: [{ variantId: sock.id, quantity: 1, unitPrice: 55000 }],
    payments: [{ tender: "gift_card", giftCardCode: gc.code, amount: 55000 }],
  });
  const gcAfter = await get(`/gift-cards/lookup?code=${gc.code}`);
  eq("gift card after redemption", gcAfter.balance, 45000);

  step("Loyalty: enable, earn, redeem");
  await put("/settings/business", { loyaltyEnabled: true, loyaltyEarnPer: 10000, loyaltyPointValue: 100, loyaltyMinRedeem: 0 });
  const before = (await get(`/customers/${customer.id}`)).loyaltyPoints;
  await post("/sales/checkout", {
    locationId: main.id,
    customerId: customer.id,
    lines: [{ variantId: sock.id, quantity: 2, unitPrice: 55000 }],
    payments: [{ tender: "method", methodId: cash.id, amount: 110000 }],
  });
  const afterEarn = (await get(`/customers/${customer.id}`)).loyaltyPoints;
  eq("points earned", afterEarn - before, 11);
  await post("/sales/checkout", {
    locationId: main.id,
    customerId: customer.id,
    lines: [{ variantId: sock.id, quantity: 1, unitPrice: 55000 }],
    payments: [
      { tender: "loyalty", points: 10, amount: 1000 },
      { tender: "method", methodId: cash.id, amount: 54000 },
    ],
  });

  step("Purchase with freight, partial payment; purchase return to supplier credit");
  const po = await post("/purchases", {
    supplierId: supplier.id,
    locationId: main.id,
    status: "ordered",
    taxInclusive: false,
    lines: [
      { variantId: v("S", "Red").id, quantity: 20, unitCost: 90000, taxRate: 10 },
      { variantId: sock.id, quantity: 100, unitCost: 15000, taxRate: 10 },
    ],
    shipping: 30000,
  });
  eq("PO status", po.status, "ordered");
  const received = await post(`/purchases/${po.id}/receive`, { payments: [{ methodId: cash.id, amount: 1000000 }] });
  eq("purchase total", received.total, Math.round((20 * 90000 + 100 * 15000) * 1.1) + 30000);
  eq("purchase due", received.amountDue, received.total - 1000000);
  const pl = received.lines.find((l) => l.variantId === sock.id);
  const pret = await post("/purchase-returns", {
    purchaseId: po.id,
    lines: [{ purchaseLineId: pl.id, quantity: 10 }],
    settlement: "credit",
  });
  check("purchase return applied to bill", pret.appliedToBill === pret.total, pret);
  await post(`/suppliers/${supplier.id}/payments`, { amount: 300000, methodId: cash.id });

  step("Expense, stock adjustment, second location + transfer");
  const rent = (await get("/accounting/accounts")).find((a) => a.code === "6000");
  await post("/expenses", { accountId: rent.id, amount: 250000, methodId: cash.id, payee: "Landlord" });
  await post("/inventory/adjustments", {
    locationId: main.id,
    reason: "damage",
    lines: [{ variantId: v("S", "Blue").id, quantityChange: -1 }],
  });
  const branch = await post("/settings/locations", { name: "Kandy Branch", code: "KDY" });
  await post("/inventory/transfers", { fromLocationId: main.id, toLocationId: branch.id, lines: [{ variantId: sock.id, quantity: 5 }] });

  step("Register shift: open, cash sale, pay-out, close short by 10.00");
  const shift = await post("/shifts/open", { locationId: main.id, openingFloat: 500000 });
  await post("/sales/checkout", {
    locationId: main.id,
    lines: [{ variantId: sock.id, quantity: 1, unitPrice: 55000 }],
    payments: [{ tender: "method", methodId: cash.id, amount: 55000 }],
  });
  await post(`/shifts/${shift.id}/movements`, { type: "pay_out", amount: 20000, reason: "Tea & snacks", accountId: (await get("/accounting/accounts")).find((a) => a.code === "6120").id });
  const cur = await get(`/shifts/${shift.id}`);
  eq("expected cash", cur.expectedCash, 500000 + 55000 - 20000);
  const closed = await post(`/shifts/${shift.id}/close`, { countedCash: cur.expectedCash - 1000 });
  eq("shift difference", closed.difference, -1000);

  step("Void a sale");
  const s9 = await post("/sales/checkout", {
    locationId: main.id,
    lines: [{ variantId: v("M", "Red").id, quantity: 1, unitPrice: 220000 }],
    payments: [{ tender: "method", methodId: card.id, amount: 220000 }],
  });
  const voided = await post(`/sales/${s9.invoice.id}/void`, { reason: "Test void" });
  eq("void status", voided.status, "void");

  step("Reconciliation");
  const tb = await get("/reports/trial-balance");
  eq("trial balance debits = credits", tb.totalDebit, tb.totalCredit);
  const bs = await get("/reports/balance-sheet");
  eq("balance sheet balances", bs.totalAssets, bs.totalLiabilitiesAndEquity);
  const accts = await get("/accounting/accounts");
  const bal = (code) => accts.find((a) => a.code === code)?.balance ?? 0;
  const custs = await get("/customers?pageSize=500&status=all");
  const sups = await get("/suppliers?pageSize=500&status=all");
  const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
  eq("AR control = Σ customer dues", bal("1100"), sum(custs.data, "dueBalance"));
  eq("Store credit liability = Σ customer credit", bal("2200"), sum(custs.data, "creditBalance"));
  eq("AP control = Σ supplier dues", bal("2000"), sum(sups.data, "dueBalance"));
  eq("Supplier advances = Σ supplier credit", bal("1350"), sum(sups.data, "creditBalance"));
  const cards = await get("/gift-cards?pageSize=500");
  eq("Gift card liability = Σ card balances", bal("2300"), sum(cards.data, "balance"));
  const stock = await get("/inventory/stock?pageSize=500");
  const diff = bal("1200") - stock.totals.value;
  check(`Inventory ledger = stock valuation (diff ${diff})`, diff === 0, { ledger: bal("1200"), stock: stock.totals.value });
  const tees = await get(`/products/${tee.id}`);
  const sRed = tees.variants.find((x) => x.options.Size === "S" && x.options.Color === "Red");
  eq("S/Red stock (10 −2 +1 +20)", sRed.stock, 29);
  const pnl = await get("/reports/profit-loss");
  check("P&L computed", typeof pnl.netProfit === "number", pnl);
  const dash = await get("/reports/dashboard");
  check("dashboard computed", typeof dash.today.netSales === "number");

  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("\nE2E aborted:", e.message);
  process.exit(1);
});
