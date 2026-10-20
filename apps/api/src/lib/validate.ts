import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import { fromZod } from "./errors";

/** zod-validator that throws our ApiError shape (handled by app.onError). */
export const vJson = <T extends ZodType>(schema: T) =>
  zValidator("json", schema, (result) => {
    if (!result.success) throw fromZod(result.error as never);
  });

export const vQuery = <T extends ZodType>(schema: T) =>
  zValidator("query", schema, (result) => {
    if (!result.success) throw fromZod(result.error as never);
  });
