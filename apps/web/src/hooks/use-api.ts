"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage, type Query } from "@/lib/api";

/**
 * GET helper. Query key = [path, query]. Pass `null` as path to disable the query.
 *   const { data, isLoading } = useApiQuery<Paginated<Invoice>>("/sales", { page, q });
 */
export function useApiQuery<T>(
  path: string | null,
  query?: Query,
  options?: Omit<UseQueryOptions<T, Error, T, unknown[]>, "queryKey" | "queryFn">,
) {
  return useQuery<T, Error, T, unknown[]>({
    ...options,
    queryKey: [path, query ?? {}],
    queryFn: () => api.get<T>(path!, query),
    enabled: !!path && (options?.enabled ?? true),
  });
}

/**
 * Invalidate every query whose path (first key element) equals or starts with one of `paths`.
 * invalidatePaths(qc, ["/sales"]) refreshes "/sales", "/sales/abc", "/sales/abc/returnable"…
 */
export function invalidatePaths(qc: QueryClient, paths: string[]) {
  return qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey[0];
      return typeof k === "string" && paths.some((p) => k === p || k.startsWith(p.endsWith("/") ? p : `${p}/`));
    },
  });
}

export interface ApiMutationOptions<TVars, TRes> {
  /** Path prefixes to invalidate on success, e.g. ["/sales", "/customers", "/reports"]. */
  invalidate?: string[];
  /** Toast on success (string or builder). */
  success?: string | ((res: TRes, vars: TVars) => string);
  /** Set false to suppress the automatic error toast. */
  errorToast?: boolean;
  onSuccess?: (res: TRes, vars: TVars) => void | Promise<void>;
  onError?: (err: Error, vars: TVars) => void;
}

/**
 * Mutation helper with toasts + invalidation.
 *   const save = useApiMutation((body: CustomerInput) => api.post<Customer>("/customers", body),
 *     { invalidate: ["/customers"], success: "Customer saved" });
 *   save.mutate(body); // or: await save.mutateAsync(body)
 */
export function useApiMutation<TVars = void, TRes = unknown>(
  fn: (vars: TVars) => Promise<TRes>,
  opts: ApiMutationOptions<TVars, TRes> = {},
) {
  const qc = useQueryClient();
  return useMutation<TRes, Error, TVars>({
    mutationFn: fn,
    onSuccess: async (res, vars) => {
      if (opts.invalidate?.length) await invalidatePaths(qc, opts.invalidate);
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(res, vars) : opts.success);
      await opts.onSuccess?.(res, vars);
    },
    onError: (err, vars) => {
      if (opts.errorToast !== false) toast.error(errorMessage(err));
      opts.onError?.(err, vars);
    },
  });
}
