import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

/** Public file serving (product images, logos). Keys are unguessable. */
export const filesPublic = new Hono<AppEnv>();

filesPublic.get("/:key{.+}", async (c) => {
  if (!c.env.FILES) throw notFound("File");
  const obj = await c.env.FILES.get(c.req.param("key"));
  if (!obj) throw notFound("File");
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

export const uploads = new Hono<AppEnv>();

uploads.post("/", requireAuth, async (c) => {
  const ctx = c.get("ctx");
  if (!c.env.FILES) throw badRequest("File storage (R2) is not configured");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Attach a file");
  if (!ALLOWED.has(file.type)) throw badRequest("Only PNG, JPEG, WEBP, GIF or SVG images are allowed");
  if (file.size > MAX_BYTES) throw badRequest("Images must be 5 MB or smaller");
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const key = `${ctx.businessId}/${newId()}.${ext}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return c.json({ key, url: `/api/files/${key}` }, 201);
});
