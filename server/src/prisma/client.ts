import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "../config";
import { currentRequestUserId } from "../shared/requestContext";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * The API's connections carry this application_name. The change-log triggers (migration
 * 20261105130000_change_log) treat a change from any other connection as made outside the app
 * (legacy "back-end updations"). Keep it in step with change_log_capture() in that migration.
 */
export const CHANGE_LOG_APP_NAME = "danamotors-api";

function withAppName(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("application_name", CHANGE_LOG_APP_NAME);
    return parsed.toString();
  } catch {
    return url;
  }
}

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

type RawClient = Pick<PrismaClient, "$executeRaw">;
// Transaction-local: it ends with the transaction, so it never leaks to another request on a pooled connection.
const setChangeLogUser = (client: RawClient, userId: string) =>
  client.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;

/**
 * Tells the change-log triggers which staff user made each write. Inside a transaction, the patched
 * `$transaction` below has already set the user for that transaction. A write outside one is wrapped in
 * a batch transaction that sets the user first. Without a signed-in user (public endpoints, background
 * jobs) nothing is wrapped: the change is still recorded as made in the app, with no user.
 */
function withChangeLogUser(base: PrismaClient): PrismaClient {
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query, ...rest }) {
          const userId = currentRequestUserId();
          // Prisma passes the surrounding transaction (interactive or batch) in __internalParams.
          const inTransaction = Boolean((rest as { __internalParams?: { transaction?: unknown } }).__internalParams?.transaction);
          if (!userId || inTransaction || !WRITE_OPERATIONS.has(operation)) return query(args);
          const [, result] = await base.$transaction([setChangeLogUser(base, userId), query(args) as Prisma.PrismaPromise<unknown>]);
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;

  const originalTransaction = extended.$transaction.bind(extended) as (...args: unknown[]) => Promise<unknown>;
  const transaction = (arg: unknown, options?: unknown): Promise<unknown> => {
    const userId = currentRequestUserId();
    if (!userId) return originalTransaction(arg, options);
    if (typeof arg === "function") {
      return originalTransaction(async (tx: Prisma.TransactionClient) => {
        await setChangeLogUser(tx, userId);
        return (arg as (tx: Prisma.TransactionClient) => unknown)(tx);
      }, options);
    }
    return originalTransaction([setChangeLogUser(extended, userId), ...(arg as Prisma.PrismaPromise<unknown>[])], options)
      .then((results) => (results as unknown[]).slice(1));
  };

  // Own properties set on the client (the patched $transaction, and jest.spyOn in tests) live here, so
  // they can be replaced and restored like ordinary properties.
  const overrides = new Map<PropertyKey, unknown>([["$transaction", transaction]]);
  return new Proxy(extended, {
    get(target, property) {
      return overrides.has(property) ? overrides.get(property) : Reflect.get(target, property);
    },
    set(_target, property, value) {
      overrides.set(property, value);
      return true;
    },
    defineProperty(_target, property, descriptor) {
      overrides.set(property, descriptor.get ? descriptor.get() : descriptor.value);
      return true;
    },
    getOwnPropertyDescriptor(target, property) {
      if (overrides.has(property)) {
        return { value: overrides.get(property), writable: true, configurable: true, enumerable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
}

function createClient(): PrismaClient {
  const base = new PrismaClient({
    // process.env first: integration tests point DATABASE_URL at the test database just before requiring this.
    datasources: { db: { url: withAppName(process.env.DATABASE_URL || config.DATABASE_URL) } },
    log: [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "warn" },
    ],
  });

  // Do not log SQL parameters: they may contain personal data or credentials.
  (base as PrismaClient<Prisma.PrismaClientOptions, "query">).$on("query", (event) => {
    if (event.duration >= config.DB_SLOW_QUERY_MS) {
      console.warn(`[db] Slow query: ${event.duration}ms`, event.query);
    } else if (config.DB_QUERY_LOG === "true") {
      console.debug(`[db] Query: ${event.duration}ms`, event.query);
    }
  });

  return withChangeLogUser(base);
}

export const prisma = global.prisma || createClient();

if (config.NODE_ENV !== "production") {
  global.prisma = prisma;
}
export default prisma;
