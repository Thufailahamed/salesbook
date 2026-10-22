import {
  DEFAULT_ACCOUNTS,
  DEFAULT_PAYMENT_METHODS,
  SEQUENCE_DEFAULTS,
  SYSTEM_ACCOUNTS,
  currencyDecimals,
  type SignupInput,
  type SystemAccountKey,
} from "@shopbooks/shared";
import type { DB } from "../db/client";
import { accounts, businesses, locations, paymentMethods, sequences, taxRates, units, users } from "../db/schema";
import { insertMany, runBatch, type Stmt } from "../lib/batch";
import { newId } from "../lib/ids";

const DEFAULT_UNITS = [
  { name: "Piece", shortName: "pcs", allowDecimal: false },
  { name: "Pair", shortName: "pair", allowDecimal: false },
  { name: "Set", shortName: "set", allowDecimal: false },
  { name: "Box", shortName: "box", allowDecimal: false },
  { name: "Dozen", shortName: "dz", allowDecimal: false },
  { name: "Kilogram", shortName: "kg", allowDecimal: true },
  { name: "Gram", shortName: "g", allowDecimal: true },
  { name: "Metre", shortName: "m", allowDecimal: true },
  { name: "Litre", shortName: "L", allowDecimal: true },
];

function localeFor(country: string | null | undefined, currency: string) {
  const byCurrency: Record<string, string> = {
    LKR: "en-LK",
    INR: "en-IN",
    PKR: "en-PK",
    BDT: "en-BD",
    GBP: "en-GB",
    EUR: "en-IE",
    AUD: "en-AU",
    NZD: "en-NZ",
    CAD: "en-CA",
    SGD: "en-SG",
    MYR: "en-MY",
    ZAR: "en-ZA",
    AED: "en-AE",
    USD: "en-US",
  };
  return byCurrency[currency] ?? (country ? `en-${country.slice(0, 2).toUpperCase()}` : "en-US");
}

/** Creates a business with its owner and all defaults in one atomic batch. */
export async function createBusiness(
  db: DB,
  input: SignupInput,
  passwordHash: string,
  subscription?: { planId: string; endsAt: number | null },
) {
  const now = Date.now();
  const businessId = newId();
  const userId = newId();
  const locationId = newId();
  const decimals = currencyDecimals(input.currency);

  const zeroTaxId = newId();
  const mainTaxId = input.defaultTaxRate > 0 ? newId() : null;

  const accountIds = {} as Record<SystemAccountKey, string>;
  const accountRows = [
    ...Object.entries(SYSTEM_ACCOUNTS).map(([key, a]) => {
      const id = newId();
      accountIds[key as SystemAccountKey] = id;
      return { id, businessId, code: a.code, name: a.name, type: a.type, subtype: a.subtype, systemKey: key, isSystem: true, createdAt: now };
    }),
    ...DEFAULT_ACCOUNTS.map((a) => ({
      id: newId(),
      businessId,
      code: a.code,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      systemKey: null,
      isSystem: false,
      createdAt: now,
    })),
  ];

  const stmts: Stmt[] = [
    db.insert(businesses).values({
      id: businessId,
      name: input.businessName,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      country: input.country || null,
      currency: input.currency.toUpperCase(),
      locale: localeFor(input.country, input.currency),
      timezone: input.timezone,
      taxInclusive: input.taxInclusive,
      defaultTaxRateId: mainTaxId ?? zeroTaxId,
      loyaltyEarnPer: 100 * 10 ** decimals,
      loyaltyPointValue: 10 ** decimals,
      roundingIncrement: 0,
      planId: subscription?.planId ?? null,
      subscriptionEndsAt: subscription?.endsAt ?? null,
      createdAt: now,
    }) as unknown as Stmt,
    db.insert(users).values({
      id: userId,
      businessId,
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: "owner",
      defaultLocationId: locationId,
      createdAt: now,
    }) as unknown as Stmt,
    db.insert(locations).values({
      id: locationId,
      businessId,
      name: "Main Store",
      code: "MAIN",
      isDefault: true,
      createdAt: now,
    }) as unknown as Stmt,
    db.insert(taxRates).values([
      { id: zeroTaxId, businessId, name: "No tax", rate: 0, isDefault: !mainTaxId, createdAt: now },
      ...(mainTaxId
        ? [{ id: mainTaxId, businessId, name: input.taxName || "Tax", rate: input.defaultTaxRate, isDefault: true, createdAt: now }]
        : []),
    ]) as unknown as Stmt,
    ...insertMany(db, accounts, accountRows),
    ...insertMany(
      db,
      paymentMethods,
      DEFAULT_PAYMENT_METHODS.map((m, i) => ({
        id: newId(),
        businessId,
        name: m.name,
        type: m.type,
        accountId: accountIds[m.account],
        sortOrder: i,
        createdAt: now,
      })),
    ),
    ...insertMany(
      db,
      sequences,
      Object.entries(SEQUENCE_DEFAULTS).map(([key, s]) => ({
        businessId,
        key,
        prefix: s.prefix,
        nextValue: 1,
        padding: key === "gift_card" ? 6 : 5,
      })),
    ),
    ...insertMany(
      db,
      units,
      DEFAULT_UNITS.map((u) => ({ id: newId(), businessId, ...u, createdAt: now })),
    ),
  ];

  await runBatch(db, stmts);
  return { businessId, userId };
}
