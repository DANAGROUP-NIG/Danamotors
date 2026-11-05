import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { canSeeCost, costVisibility, ignoreCostInput, stripCost } from './costVisibility';
import { withoutCostColumns } from '../modules/parts-report/partsReport.service';
import { PERMISSIONS, ROLES } from '../shared/constants/roles';

const storeOfficer = { role: ROLES.BRANCH_STORE_MANAGER, permissions: [PERMISSIONS.SPAREPART_COST_READ] };
const technician = { role: ROLES.TECHNICIAN, permissions: [PERMISSIONS.SPAREPART_READ] };

/** Runs costVisibility for a request and returns what was sent. */
function send(user: object | undefined, url: string, body: unknown) {
  const sent: unknown[] = [];
  const res = { json: (value: unknown) => { sent.push(value); return res; } } as unknown as Response;
  costVisibility({ user, originalUrl: url } as Request, res, (() => undefined) as NextFunction);
  res.json(body);
  return sent[0] as Record<string, unknown>;
}

describe('Who sees dealer rates', () => {
  it.each([
    ['a super admin', { role: ROLES.SUPER_ADMIN, permissions: [] }, true],
    ['a user with sparepart:cost:read', storeOfficer, true],
    ['a user without it', technician, false],
    ['nobody signed in', undefined, false],
  ])('%s', (_label, user, expected) => {
    expect(canSeeCost(user)).toBe(expected);
  });
});

describe('Removing dealer rates from responses', () => {
  const part = { id: 'p1', partNumber: '58101', unitRate: 1200, unitPrice: 1200, retailRate: 1500, basicRate: 3, stock: [{ quantity: 2, dealerRate: 1200 }] };

  it('removes cost keys at any depth and keeps selling prices', () => {
    const body = send(technician, '/api/inventory/parts/p1', { data: { part } }) as { data: { part: Record<string, unknown> } };
    expect(body.data.part).toEqual({ id: 'p1', partNumber: '58101', retailRate: 1500, stock: [{ quantity: 2 }] });
  });

  it('leaves the response alone for a user who may see cost', () => {
    expect(send(storeOfficer, '/api/inventory/parts/p1', { data: { part } })).toEqual({ data: { part } });
  });

  it('removes amounts on stock documents, which are valued at dealer rate', () => {
    const stn = { id: 's1', totalValue: 5000, lines: [{ quantity: 2, unitRate: 2500, amount: 5000 }] };
    expect(send(technician, '/api/inventory/stn/s1', { data: stn })).toEqual({ data: { id: 's1', lines: [{ quantity: 2 }] } });
  });

  it('keeps selling amounts elsewhere (invoices, CPOs, requisitions)', () => {
    const invoice = { total: 9000, lines: [{ rate: 4500, amount: 9000, unitCost: 3000 }] };
    expect(send(technician, '/api/finance/invoices/i1', { data: invoice })).toEqual({ data: { total: 9000, lines: [{ rate: 4500, amount: 9000 }] } });
  });

  it('keeps Dates and Decimals intact', () => {
    const when = new Date('2026-11-05T00:00:00Z');
    const amount = new Prisma.Decimal('12.50');
    expect(stripCost({ when, amount })).toEqual({ when, amount });
  });
});

describe('Part writes from users who cannot see cost', () => {
  function body(user: object, url: string) {
    const req = { user, originalUrl: url, body: { name: 'Filter', unitRate: 0, basicRate: 1 } } as unknown as Request;
    ignoreCostInput(req, {} as Response, (() => undefined) as NextFunction);
    return req.body;
  }

  it('drops the rate fields so saving a part never zeroes the dealer rate', () => {
    expect(body(technician, '/api/inventory/parts/p1')).toEqual({ name: 'Filter' });
  });

  it('keeps them for a user who may see cost', () => {
    expect(body(storeOfficer, '/api/inventory/parts/p1')).toEqual({ name: 'Filter', unitRate: 0, basicRate: 1 });
  });
});

describe('Parts report cost columns', () => {
  it('drops cost columns and their values from rows and totals', () => {
    const report = withoutCostColumns({
      kind: 'current-stock', title: 'Current Stock', grouped: false, truncated: false,
      columns: [
        { key: 'partNumber', label: 'Part', type: 'text' },
        { key: 'quantity', label: 'Qty', type: 'qty', total: true },
        { key: 'rate', label: 'Rate', type: 'money', cost: true },
        { key: 'value', label: 'Value', type: 'money', total: true, cost: true },
      ],
      rows: [{ partNumber: '58101', quantity: 2, rate: 1200, value: 2400 }],
      totals: { quantity: 2, value: 2400 },
    });
    expect(report.columns.map(column => column.key)).toEqual(['partNumber', 'quantity']);
    expect(report.rows).toEqual([{ partNumber: '58101', quantity: 2 }]);
    expect(report.totals).toEqual({ quantity: 2 });
  });
});
