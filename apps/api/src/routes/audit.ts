import { and, desc, eq, gte, like, lt, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { addDays, listQuerySchema, type AuditLog } from "@shopbooks/shared";
import { auditLogs, users } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { likeQ, pageParams, paged } from "../lib/http";
import { vQuery } from "../lib/validate";
import { num, zonedDayStart } from "../services/reports-utils";

const app = new Hono<AppEnv>();

const auditQuery = listQuerySchema.extend({
  userId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

app.get("/", requirePerm("audit.view"), vQuery(auditQuery), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const { limit, offset } = pageParams(q);
  const tz = ctx.business.timezone;
  const conds: SQL[] = [eq(auditLogs.businessId, ctx.businessId)];
  if (q.userId) conds.push(eq(auditLogs.userId, q.userId));
  if (q.entityType) conds.push(eq(auditLogs.entityType, q.entityType));
  if (q.entityId) conds.push(eq(auditLogs.entityId, q.entityId));
  if (q.from) conds.push(gte(auditLogs.createdAt, zonedDayStart(q.from, tz)));
  if (q.to) conds.push(lt(auditLogs.createdAt, zonedDayStart(addDays(q.to, 1), tz)));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(auditLogs.summary, term), like(auditLogs.action, term), like(users.name, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select({ a: auditLogs, userName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where),
  ]);
  const data: AuditLog[] = rows.map(({ a, userName }) => ({
    id: a.id,
    createdAt: a.createdAt,
    userId: a.userId,
    userName: userName ?? null,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    summary: a.summary,
  }));
  return c.json(paged(data, num(count?.n), q));
});

export default app;
