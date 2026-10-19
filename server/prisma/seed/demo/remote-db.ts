/**
 * Settings for running the seed from a workstation against a remote database.
 *
 * Import this first: it must run before the app's config and Prisma client load.
 */
import type { PrismaClient } from "@prisma/client";

// Every query pays the network round trip (about 0.5 s to the shared server), so most
// queries would be logged as slow. Only log really slow ones, unless set explicitly.
process.env.DB_SLOW_QUERY_MS ??= "60000";

/**
 * The services cap interactive transactions at 5-15 s, sized for an API server next to its
 * database. Over a slow link a bill (about 30 queries in one transaction) takes longer and
 * is rolled back. For this process only, give interactive transactions more time. The
 * services' logic, locks and isolation levels are unchanged.
 */
export function allowSlowTransactions(client: PrismaClient, timeoutMs = 120_000, maxWaitMs = 30_000) {
  const original = client.$transaction.bind(client) as (arg: unknown, options?: { maxWait?: number; timeout?: number; isolationLevel?: unknown }) => Promise<unknown>;
  const patched = (arg: unknown, options?: { maxWait?: number; timeout?: number; isolationLevel?: unknown }) =>
    typeof arg === "function"
      ? original(arg, { ...options, maxWait: Math.max(options?.maxWait ?? 0, maxWaitMs), timeout: Math.max(options?.timeout ?? 0, timeoutMs) })
      : original(arg, options);
  (client as unknown as { $transaction: typeof patched }).$transaction = patched;
}
