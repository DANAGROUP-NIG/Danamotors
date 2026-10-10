/**
 * Stock valuation for the stock reports (legacy "Based on: FIFO / Dealer Rate").
 *
 * A branch's stock of one part is replayed movement by movement. On FIFO the oldest receipt
 * is issued first, so the stock left is always the newest receipts; on dealer rate every unit
 * is worth the part's dealer rate. Issues made when there was no stock to cost them against
 * go out at value 0, as on the legacy ledger ("All values in Issue are at Cost").
 */
import { money } from "../finance/money";

export type Basis = "FIFO" | "DEALER";

export interface Layer {
  quantity: number;
  rate: number;
  /** When the units were received; null for stock with no receipt on record (opening stock). */
  date: Date | null;
}

export interface Piece {
  quantity: number;
  rate: number;
  value: number;
}

/** Movement types that change a branch's stock quantity. RESERVED/UNRESERVED do not. */
export const STOCK_MOVEMENTS = ["STOCKED", "RECEIVED", "TRANSFER_IN", "RETURNED", "ADJUSTMENT", "ISSUED", "TRANSFER_OUT"];
/** Movement types that consume stock (issues, for slow-moving and consumption). */
export const ISSUE_MOVEMENTS = ["ISSUED", "TRANSFER_OUT"];

export class StockValuation {
  private layers: Layer[] = [];
  /** Units issued with nothing in stock; later receipts make them good first. */
  private deficit = 0;

  constructor(
    private readonly basis: Basis,
    private readonly dealerRate: number,
  ) {}

  get quantity() {
    return this.layers.reduce((s, l) => s + l.quantity, 0) - this.deficit;
  }

  get value() {
    if (this.basis === "DEALER") return money(this.quantity * this.dealerRate);
    return money(this.layers.reduce((s, l) => s + l.quantity * l.rate, 0));
  }

  /** The units in stock, oldest first. */
  get stock(): readonly Layer[] {
    return this.layers;
  }

  receive(quantity: number, rate: number, date: Date | null) {
    const covered = Math.min(quantity, this.deficit);
    this.deficit -= covered;
    if (quantity > covered) this.layers.push({ quantity: quantity - covered, rate: this.basis === "FIFO" ? rate : this.dealerRate, date });
  }

  /** Takes units out oldest first; consecutive pieces at the same rate are merged. */
  issue(quantity: number): Piece[] {
    const pieces: Piece[] = [];
    const take = (q: number, rate: number) => {
      const last = pieces[pieces.length - 1];
      if (last && last.rate === rate) last.quantity += q;
      else pieces.push({ quantity: q, rate, value: 0 });
    };
    let left = quantity;
    while (left > 0 && this.layers.length) {
      const layer = this.layers[0];
      const q = Math.min(left, layer.quantity);
      take(q, layer.rate);
      layer.quantity -= q;
      left -= q;
      if (layer.quantity === 0) this.layers.shift();
    }
    if (left > 0) {
      this.deficit += left;
      take(left, this.basis === "FIFO" ? 0 : this.dealerRate);
    }
    return pieces.map((p) => ({ ...p, value: money(p.quantity * p.rate) }));
  }

  /** Applies a signed movement: receipts at `rate`, issues at cost. */
  apply(quantity: number, rate: number, date: Date): Piece[] {
    if (quantity > 0) {
      this.receive(quantity, rate, date);
      const unit = this.basis === "FIFO" ? rate : this.dealerRate;
      return [{ quantity, rate: unit, value: money(quantity * unit) }];
    }
    return quantity < 0 ? this.issue(-quantity) : [];
  }
}

/**
 * Stock held before the first movement on record (migrated or seeded stock): what the current
 * quantity cannot be explained by the movements.
 */
export function untrackedOpening(currentQuantity: number, movements: { quantity: number }[]) {
  return currentQuantity - movements.reduce((s, m) => s + m.quantity, 0);
}

/** Legacy default: ageing in years (1 to 5). */
export const DEFAULT_AGE_LIMITS = [365, 730, 1095, 1460, 1825];

/** Age-band labels for five increasing day limits, e.g. "0–365 days" … "Above 1825 days". */
export function ageBandLabels(limits: number[]) {
  return [...limits.map((limit, i) => `${i === 0 ? 0 : limits[i - 1] + 1}–${limit} days`), `Above ${limits[limits.length - 1]} days`];
}
