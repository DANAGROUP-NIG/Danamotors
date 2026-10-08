import { Prisma } from '@prisma/client';
import { BadRequestError, ConflictError } from '../../shared/errors/appError';
import { money, sumMoney } from './money';

export type PartyDocumentKind = 'INVOICE' | 'RECEIPT' | 'NOTE';
export type PartyDocument = { id: string; kind: PartyDocumentKind; number: string; date: Date; amount: number; balance: number };
export type AdjustmentSelection = { id: string; kind: PartyDocumentKind; amount: number };
export type AdjustmentPair = { debit: AdjustmentSelection; credit: AdjustmentSelection; amount: number };

const documentKey = (document: { kind: PartyDocumentKind; id: string }) => document.kind + ':' + document.id;

export function validateAdjustmentSelections(selections: AdjustmentSelection[], documents: PartyDocument[]) {
  const balances = new Map(documents.map(document => [documentKey(document), document.balance]));
  const keys = selections.map(documentKey);
  if (new Set(keys).size !== keys.length) throw new BadRequestError('Select each document only once');
  for (const selection of selections) {
    const balance = balances.get(documentKey(selection));
    if (balance === undefined) throw new BadRequestError('A selected document is not available for this party and branch');
    if (!Number.isFinite(balance) || balance < 0) throw new ConflictError('The document has an invalid balance; reconcile it before adjusting');
    if (!Number.isFinite(selection.amount) || money(selection.amount) <= 0) throw new BadRequestError('Adjustment amounts must be positive');
    if (new Prisma.Decimal(selection.amount).decimalPlaces() > 2) throw new BadRequestError('Use at most two decimal places');
    if (money(selection.amount) > money(balance)) throw new ConflictError('Adjustment exceeds the current document balance');
  }
}

export function pairAdjustments(debits: AdjustmentSelection[], credits: AdjustmentSelection[]): AdjustmentPair[] {
  if ([...debits, ...credits].some(line => !Number.isFinite(line.amount) || line.amount <= 0 || new Prisma.Decimal(line.amount).decimalPlaces() > 2)) throw new BadRequestError('Adjustment amounts must be positive currency values');
  const debitTotal = sumMoney(debits.map(line => line.amount));
  const creditTotal = sumMoney(credits.map(line => line.amount));
  if (debitTotal <= 0 || debitTotal !== creditTotal) throw new BadRequestError('Debit and credit adjusted totals must be equal and positive');
  const pairs: AdjustmentPair[] = [];
  let creditIndex = 0;
  let creditRemaining = money(credits[0].amount);
  for (const debit of debits) {
    let debitRemaining = money(debit.amount);
    while (debitRemaining > 0) {
      const amount = money(Math.min(debitRemaining, creditRemaining));
      pairs.push({ debit, credit: credits[creditIndex], amount });
      debitRemaining = sumMoney([debitRemaining, -amount]);
      creditRemaining = sumMoney([creditRemaining, -amount]);
      if (creditRemaining === 0 && creditIndex < credits.length - 1) creditRemaining = money(credits[++creditIndex].amount);
    }
  }
  return pairs;
}

export function fifoAdjustments(debits: PartyDocument[], credits: PartyDocument[]) {
  const oldestFirst = (left: PartyDocument, right: PartyDocument) => left.date.getTime() - right.date.getTime() || left.number.localeCompare(right.number) || left.id.localeCompare(right.id);
  const orderedDebits = [...debits].filter(line => line.balance > 0).sort(oldestFirst);
  const orderedCredits = [...credits].filter(line => line.balance > 0).sort(oldestFirst);
  const total = (documents: PartyDocument[]) => documents.reduce((sum, line) => sum.plus(money(line.balance)), new Prisma.Decimal(0));
  const amount = money(Prisma.Decimal.min(1e12, total(orderedDebits), total(orderedCredits)).toNumber());
  const fill = (documents: PartyDocument[]) => {
    let remaining = money(amount);
    const selections: AdjustmentSelection[] = [];
    for (const document of documents) {
      if (remaining <= 0) break;
      const allocated = money(Math.min(document.balance, remaining));
      selections.push({ id: document.id, kind: document.kind, amount: allocated });
      remaining = sumMoney([remaining, -allocated]);
    }
    return selections;
  };
  return { debits: fill(orderedDebits), credits: fill(orderedCredits), amount: money(amount) };
}
