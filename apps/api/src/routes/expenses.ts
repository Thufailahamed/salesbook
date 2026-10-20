import { Hono } from "hono";
import { expenseListQuerySchema, expenseSchema, voidSchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import { createExpense, getExpenseDto, listExpenses, voidExpense } from "../services/expenses";

const app = new Hono<AppEnv>();
const view = requirePerm("expenses.view");
const manage = requirePerm("expenses.manage");

app.get("/", view, vQuery(expenseListQuerySchema), async (c) => {
  return c.json(await listExpenses(c.get("ctx"), c.req.valid("query")));
});

app.post("/", manage, vJson(expenseSchema), async (c) => {
  return c.json(await createExpense(c.get("ctx"), c.req.valid("json")), 201);
});

app.get("/:id", view, async (c) => c.json(await getExpenseDto(c.get("ctx"), c.req.param("id"))));

app.post("/:id/void", manage, vJson(voidSchema), async (c) => {
  return c.json(await voidExpense(c.get("ctx"), c.req.param("id"), c.req.valid("json").reason));
});

export default app;
