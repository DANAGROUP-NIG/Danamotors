import type { NextFunction, Request, Response } from 'express';
import { PERMISSIONS, ROLES } from '../shared/constants/roles';

/**
 * Dealer rates, purchase prices and stock values are seen only with `sparepart:cost:read` (legacy
 * "Can View Dealer Rate"). Every response is filtered here, so no endpoint can leak them by accident.
 *
 * - These keys are a dealer rate or a cost wherever they appear (part master, catalogue, indents, STNs,
 *   MIT/MRN lines, stock-take lines, invoice line cost) and are removed from every response.
 * - On stock documents (indents, STNs, MIT/MRN, vendor receipts, transfers, picking and packing lists),
 *   line and document amounts are valued at those rates, so they are removed too. Elsewhere `amount`
 *   is a selling amount (invoices, CPOs, requisitions) and is left alone.
 * - Parts reports drop their cost columns separately (partsReport.controller.ts).
 */
const COST_KEYS = new Set(['unitPrice', 'unitRate', 'dealerRate', 'basicRate', 'unitCost', 'oldDealerRate', 'newDealerRate']);
const VALUE_KEYS = new Set(['amount', 'totalValue', 'totalAmount']);
const STOCK_DOCUMENT_PATHS = /^\/api\/inventory\/(indents|stn|mobis|mrn|transfer-mrns|transfers|vendor-receipts|packing-lists|picking-lists|cases)(\/|$|\?)/;
/** Writes that may set a part's dealer or base rate. */
const PART_WRITE_PATHS = /^\/api\/inventory\/(parts|part-catalogue)(\/|$|\?)/;

type Viewer = { role?: string; permissions?: readonly string[] } | undefined;

export function canSeeCost(user: Viewer): boolean {
  return !!user && (user.role === ROLES.SUPER_ADMIN || !!user.permissions?.includes(PERMISSIONS.SPAREPART_COST_READ));
}

/** A copy of `value` without cost keys (and, for stock documents, without value keys). */
export function stripCost(value: unknown, alsoValues = false): unknown {
  if (Array.isArray(value)) return value.map(item => stripCost(item, alsoValues));
  // Only plain objects are walked: Dates, Decimals and Buffers serialise themselves.
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (COST_KEYS.has(key) || (alsoValues && VALUE_KEYS.has(key))) continue;
    out[key] = stripCost(item, alsoValues);
  }
  return out;
}

/** Mounted before the API routes; `req.user` is read when the response is sent, after authentication. */
export function costVisibility(req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    if (canSeeCost(req.user)) return json(body);
    return json(stripCost(body, STOCK_DOCUMENT_PATHS.test(req.originalUrl)));
  };
  next();
}

/**
 * A user who cannot see the dealer rate cannot set it either: rate fields sent to the part master are
 * dropped, so saving a part form without them never zeroes the rate. Runs after authentication.
 */
export function ignoreCostInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object' && PART_WRITE_PATHS.test(req.originalUrl) && !canSeeCost(req.user)) {
    for (const key of COST_KEYS) delete (req.body as Record<string, unknown>)[key];
  }
  next();
}
