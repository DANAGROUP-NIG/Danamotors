import type { NextFunction, Request, Response } from 'express';
import prisma from '../../prisma/client';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/appError';
import { ROLES } from '../../shared/constants/roles';
import type { JWTPayload } from '../../shared/types';
import { resolveFilterLabels } from './core/labels';
import { resolveReportScope } from './core/scope';
import { applyMode } from './core/shape';
import type { ReportDb, ReportDefinition, ReportMode, ReportResponse } from './core/types';
import { listLookup, type LookupSource } from './lookups';

const STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = '30s'";

/** Runs a report inside an existing transaction (also used by the integration tests). */
export async function executeReport(
  db: ReportDb,
  definition: ReportDefinition,
  user: JWTPayload,
  query: Record<string, unknown>,
): Promise<ReportResponse> {
  const scope = await resolveReportScope(db, user, query.branchId as string | undefined);
  const body = applyMode(await definition.run(db, scope, query), query.mode as ReportMode | undefined);
  const applied = await resolveFilterLabels(db, definition.filterKeys, query as Record<string, string[] | undefined>);
  return {
    report: { slug: definition.slug, title: definition.title, width: definition.width, generatedAt: new Date().toISOString() },
    filters: { query, applied },
    rows: body.rows,
    groups: body.groups,
    totals: body.totals,
    summary: body.summary,
    breakdown: body.breakdown,
    meta: {
      rowCount: body.rows.length,
      truncated: Boolean(body.truncated),
      branch: scope.branch ?? 'ALL',
      timeZone: scope.timeZone,
    },
  };
}

/**
 * Every report reads one consistent snapshot: a read-only, repeatable-read transaction with
 * a statement timeout so a very wide report cannot hold a connection indefinitely.
 */
export function runReport(definition: ReportDefinition, user: JWTPayload, query: Record<string, unknown>) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      await tx.$executeRawUnsafe(STATEMENT_TIMEOUT);
      return executeReport(tx, definition, user, query);
    },
    { maxWait: 5_000, timeout: 35_000 },
  );
}

export function reportHandler(definition: ReportDefinition) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const data = await runReport(definition, req.user, req.query as Record<string, unknown>);
      res.status(200).json({ status: 'success', statusCode: 200, data });
    } catch (error) {
      next(error);
    }
  };
}

/** Lookups feed the report filters, so any report permission is enough to read them. */
export function requireAnyReportPermission(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role === ROLES.SUPER_ADMIN || req.user.permissions.some((permission) => permission.startsWith('report:'))) return next();
  next(new ForbiddenError('You do not have permission to run reports'));
}

export async function lookupHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    const user = req.user;
    const data = await prisma.$transaction(async (tx) => {
      const scope = await resolveReportScope(tx, user, req.query.branchId as string | undefined);
      return listLookup(tx, scope, req.params.source as LookupSource);
    });
    res.status(200).json({ status: 'success', statusCode: 200, data });
  } catch (error) {
    next(error);
  }
}
