import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { paymentListQuerySchema, voidSchema } from "@shopbooks/shared";
import { customers, payments, suppliers } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { likeQ, pageParams, paged } from "../lib/http";
import { vJson, vQuery } from "../lib/validate";
import { getPaymentDto, mapPayments, paymentSelect, voidPayment } from "../services/payments";
import { num } from "../services/reports-utils";

const app = new Hono<AppEnv>();

app.get("/", requirePerm("payments.view"), vQuery(paymentListQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(payments.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(payments.date, q.from));
  if (q.to) conds.push(lte(payments.date, q.to));
  if (q.direction) conds.push(eq(payments.direction, q.direction));
  if (q.partyType) conds.push(eq(payments.partyType, q.partyType));
  if (q.partyId) conds.push(eq(payments.partyId, q.partyId));
  if (q.methodId) conds.push(eq(payments.methodId, q.methodId));
  if (q.tender) conds.push(eq(payments.tender, q.tender));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(
      or(like(payments.number, term), like(payments.reference, term), like(customers.name, term), like(suppliers.name, term))!,
    );
  }
  const where = and(...conds);
  const [rows, [agg]] = await Promise.all([
    paymentSelect(ctx).where(where).orderBy(desc(payments.createdAt)).limit(limit).offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        totalIn: sql<number>`coalesce(sum(case when ${payments.status} = 'completed' and ${payments.tender} = 'method' and ${payments.direction} = 'in' then ${payments.amount} else 0 end), 0)`,
        totalOut: sql<number>`coalesce(sum(case when ${payments.status} = 'completed' and ${payments.tender} = 'method' and ${payments.direction} = 'out' then ${payments.amount} else 0 end), 0)`,
      })
      .from(payments)
      .leftJoin(customers, and(eq(payments.partyType, "customer"), eq(customers.id, payments.partyId)))
      .leftJoin(suppliers, and(eq(payments.partyType, "supplier"), eq(suppliers.id, payments.partyId)))
      .where(where),
  ]);
  return c.json({
    ...paged(await mapPayments(ctx, rows), num(agg?.n), q),
    totals: { in: num(agg?.totalIn), out: num(agg?.totalOut) },
  });
});

app.get("/:id", requirePerm("payments.view", "customers.payments"), async (c) =>
  c.json(await getPaymentDto(c.get("ctx"), c.req.param("id"))),
);

// Permission checks (sales.void / suppliers.manage) happen inside voidPayment.
app.post("/:id/void", vJson(voidSchema), async (c) =>
  c.json(await voidPayment(c.get("ctx"), c.req.param("id"), c.req.valid("json").reason)),
);

export default app;
