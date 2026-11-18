import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Per-request context. The Prisma client (src/prisma/client.ts) reads the staff user id from here and
 * passes it to Postgres as `app.user_id`, so the change-log triggers know who made each change.
 */
type RequestContext = { userId?: string };

const storage = new AsyncLocalStorage<RequestContext>();

/** Mounted once in app.ts, before any route: gives every request its own context. */
export function requestContextMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  storage.run({}, next);
}

/** Called by the auth middlewares once the staff user is known. */
export function setRequestUser(userId: string): void {
  const store = storage.getStore();
  if (store) store.userId = userId;
}

export function currentRequestUserId(): string | undefined {
  return storage.getStore()?.userId;
}

/** Runs `fn` as `userId` (tests, scripts and background jobs that act for a user). */
export function runAsUser<T>(userId: string | undefined, fn: () => T): T {
  return storage.run({ userId }, fn);
}
