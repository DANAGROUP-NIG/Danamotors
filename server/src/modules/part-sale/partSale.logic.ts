/**
 * Pure rules for CPD part sale:
 *   customer purchase order (CPO) -> pick -> counter-sale bill -> sale return.
 * Database-free so it can be unit tested directly.
 *
 * Pricing follows the legacy counter sale (countersale/csissue/csfatax, trantype C), per line:
 *   gross          = quantity x retail rate
 *   trade discount = gross x line trade discount %          (csissue.discountper; ABJ, Lagos)
 *   cash discount  = (gross - trade) x bill cash discount %  (countersale.CashDiscPer)
 *   handling       = (gross - trade - cash) x line handling % (csissue.handlingper; Lagos 9%)
 *   VAT            = (gross - trade - cash + handling) x VAT % (taxable parts on a VAT sale)
 *   total = sum of (gross - trade - cash + handling + VAT), rounded DOWN to the nearest 10 naira.
 * Checked against legacy Lagos bill 2024000016 (8% trade, 22.2% cash, 9% handling) to the kobo.
 * Returns are priced with the same percentages as the bill line they reverse.
 */
import { CustomerOrderStatus, Prisma } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";
import { money, sumMoney } from "../finance/money";

export interface PriceLineInput {
  quantity: number;
  rate: number;
  vatPercent: number;
  /** Legacy line discount (csissue.discountper), before the cash discount. */
  tradeDiscountPercent?: number;
  /** Legacy line handling (csissue.handlingper), on the value after both discounts. */
  handlingPercent?: number;
}

export interface PricedLine extends PriceLineInput {
  gross: number;
  tradeDiscount: number;
  /** Cash discount. */
  discount: number;
  handling: number;
  vat: number;
  /** gross - trade - cash + handling + VAT, before the bill's round-off. */
  net: number;
}

export interface SaleTotals {
  gross: number;
  tradeDiscount: number;
  /** Cash discount. */
  discount: number;
  handling: number;
  vat: number;
  roundOff: number;
  total: number;
}

const percentOf = (amount: number, percent: number) =>
  money(new Prisma.Decimal(amount).times(percent).div(100).toNumber());

/** Legacy CPD bills and returns are rounded down to the nearest 10 naira. */
export function floorToTen(amount: number): number {
  return new Prisma.Decimal(amount).div(10).floor().times(10).toNumber();
}

export function assertPercent(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new BadRequestError(`${label} must be between 0 and 100`);
  }
}

/** Price lines with one cash discount % for the whole bill (legacy CashDiscPer). */
export function priceSale(lines: PriceLineInput[], cashDiscountPercent: number): { lines: PricedLine[]; totals: SaleTotals } {
  assertPercent(cashDiscountPercent, "Cash discount");
  const priced = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new BadRequestError("Quantities must be whole numbers above zero");
    }
    if (!Number.isFinite(line.rate) || line.rate < 0) throw new BadRequestError("Rates must be zero or more");
    assertPercent(line.vatPercent, "VAT");
    assertPercent(line.tradeDiscountPercent ?? 0, "Trade discount");
    assertPercent(line.handlingPercent ?? 0, "Handling");
    const gross = money(new Prisma.Decimal(line.quantity).times(line.rate).toNumber());
    const tradeDiscount = percentOf(gross, line.tradeDiscountPercent ?? 0);
    const afterTrade = money(gross - tradeDiscount);
    const discount = percentOf(afterTrade, cashDiscountPercent);
    const afterCash = money(afterTrade - discount);
    const handling = percentOf(afterCash, line.handlingPercent ?? 0);
    const vat = percentOf(money(afterCash + handling), line.vatPercent);
    return { ...line, gross, tradeDiscount, discount, handling, vat, net: money(afterCash + handling + vat) };
  });
  const gross = sumMoney(priced.map((l) => l.gross));
  const tradeDiscount = sumMoney(priced.map((l) => l.tradeDiscount));
  const discount = sumMoney(priced.map((l) => l.discount));
  const handling = sumMoney(priced.map((l) => l.handling));
  const vat = sumMoney(priced.map((l) => l.vat));
  const beforeRoundOff = money(gross - tradeDiscount - discount + handling + vat);
  const total = floorToTen(beforeRoundOff);
  return { lines: priced, totals: { gross, tradeDiscount, discount, handling, vat, roundOff: money(total - beforeRoundOff), total } };
}

/**
 * Legacy CashDiscAmtorPer: the discount may be entered as an amount (a negotiated
 * price) instead of a percentage. Convert it to the percentage of the value it applies to:
 * the gross after any trade discount (legacy ABJ bill 2026000002: 2,000 on 10,271,627.33).
 */
export function discountPercentFromAmount(gross: number, amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new BadRequestError("Cash discount amount must be zero or more");
  if (amount > gross) throw new BadRequestError("Cash discount cannot exceed the bill value");
  if (gross === 0) return 0;
  return new Prisma.Decimal(amount).div(gross).times(100).toDecimalPlaces(6).toNumber();
}

// ── CPO quantities ───────────────────────────────────────────────────────────

export interface OrderLineQuantities {
  orderedQuantity: number;
  pickedQuantity: number;
  billedQuantity: number;
  cancelledQuantity: number;
}

/** Still to be picked (or billed straight from stock). */
export const openQuantity = (l: OrderLineQuantities) =>
  l.orderedQuantity - l.pickedQuantity - l.billedQuantity - l.cancelledQuantity;

/** Can still be billed: picked units plus anything not yet picked. */
export const billableQuantity = (l: OrderLineQuantities) => l.orderedQuantity - l.billedQuantity - l.cancelledQuantity;

/** Status from line quantities. Cancelled orders are set explicitly and never derived. */
export function orderStatus(lines: OrderLineQuantities[]): CustomerOrderStatus {
  const billed = lines.reduce((s, l) => s + l.billedQuantity, 0);
  const remaining = lines.reduce((s, l) => s + billableQuantity(l), 0);
  if (remaining === 0) return billed > 0 ? CustomerOrderStatus.BILLED : CustomerOrderStatus.CANCELLED;
  return billed > 0 ? CustomerOrderStatus.PARTLY_BILLED : CustomerOrderStatus.OPEN;
}

/**
 * Split a billed quantity between units already reserved for the line (picked)
 * and units taken straight from free stock.
 */
export function planIssue(line: OrderLineQuantities, quantity: number, freeStock: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestError("Bill quantities must be whole numbers above zero");
  if (quantity > billableQuantity(line)) {
    throw new BadRequestError(`Only ${billableQuantity(line)} unit(s) are left to bill on this order line`);
  }
  const fromPicked = Math.min(quantity, line.pickedQuantity);
  const fromStock = quantity - fromPicked;
  if (fromStock > Math.max(0, freeStock)) {
    throw new BadRequestError(
      `Only ${line.pickedQuantity + Math.max(0, freeStock)} unit(s) are picked or in stock for this line`,
    );
  }
  return { fromPicked, fromStock };
}

/** Units that may still come back on a bill line. */
export function returnableQuantity(line: { quantity: number; returnedQuantity: number }) {
  return line.quantity - line.returnedQuantity;
}

/** Legacy CPO "valid till" defaults to the order date plus three months. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
