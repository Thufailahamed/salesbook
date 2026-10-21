import type { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 402 | 403 | 404 | 409 | 422 | 500,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details);
export const unauthorized = (message = "Please sign in to continue") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do that") => new ApiError(403, "forbidden", message);
export const notFound = (what = "Record") => new ApiError(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new ApiError(409, "conflict", message);
export const invalid = (message: string, details?: unknown) => new ApiError(422, "validation_error", message, details);

export function fromZod(error: ZodError) {
  const issues = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  const first = issues[0];
  const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : "Invalid input";
  return invalid(message, issues);
}
