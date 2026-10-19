import { CustomerOrderStatus } from "@prisma/client";
import {
  billableQuantity,
  discountPercentFromAmount,
  floorToTen,
  openQuantity,
  orderStatus,
  planIssue,
  priceSale,
  returnableQuantity,
} from "./partSale.logic";

const line = (o: Partial<{ orderedQuantity: number; pickedQuantity: number; billedQuantity: number; cancelledQuantity: number }>) => ({
  orderedQuantity: 5,
  pickedQuantity: 0,
  billedQuantity: 0,
  cancelledQuantity: 0,
  ...o,
});

describe("priceSale", () => {
  // Legacy CPD counter sale 2026000010: part 97235D4000, 1 x 273,313.81, cash discount 22.5%, VAT 7.5%.
  it("reproduces a legacy CPD bill, rounded down to the nearest 10 naira", () => {
    const { totals } = priceSale([{ quantity: 1, rate: 273313.81, vatPercent: 7.5 }], 22.5);
    expect(totals).toEqual({ gross: 273313.81, discount: 61495.61, vat: 15886.37, roundOff: -4.57, total: 227700 });
  });

  // Legacy CPD sale returns 2025000003-5 (bills 2025000010, 2025000015, 2025000028).
  it.each([
    [1, 213555.94, 177910],
    [2, 35206.17, 58660],
    [1, 33223.45, 27670],
  ])("reproduces a legacy CPD return: %i x %d = %d", (quantity, rate, total) => {
    expect(priceSale([{ quantity, rate, vatPercent: 7.5 }], 22.5).totals.total).toBe(total);
  });

  it("charges VAT only on taxable lines", () => {
    const { lines, totals } = priceSale(
      [
        { quantity: 2, rate: 100, vatPercent: 7.5 },
        { quantity: 1, rate: 100, vatPercent: 0 },
      ],
      0,
    );
    expect(lines.map((l) => l.vat)).toEqual([15, 0]);
    expect(totals).toMatchObject({ gross: 300, vat: 15, total: 310 });
  });

  it("allows a free-of-charge bill with a 100% discount", () => {
    expect(priceSale([{ quantity: 1, rate: 28419498, vatPercent: 7.5 }], 100).totals.total).toBe(0);
  });

  it("rejects fractional quantities and out-of-range percentages", () => {
    expect(() => priceSale([{ quantity: 1.5, rate: 10, vatPercent: 0 }], 0)).toThrow(/whole numbers/);
    expect(() => priceSale([{ quantity: 1, rate: 10, vatPercent: 0 }], 101)).toThrow(/between 0 and 100/);
  });
});

describe("floorToTen", () => {
  it("never rounds up", () => {
    expect(floorToTen(49119.4)).toBe(49110);
    expect(floorToTen(49110)).toBe(49110);
    expect(floorToTen(9.99)).toBe(0);
  });
});

describe("discountPercentFromAmount", () => {
  it("turns a negotiated discount amount into a percentage", () => {
    expect(discountPercentFromAmount(1000, 225)).toBe(22.5);
  });

  it("rejects a discount above the bill value", () => {
    expect(() => discountPercentFromAmount(100, 101)).toThrow(/cannot exceed/);
  });
});

describe("order quantities", () => {
  it("tracks open and billable quantities", () => {
    const l = line({ pickedQuantity: 2, billedQuantity: 1, cancelledQuantity: 1 });
    expect(openQuantity(l)).toBe(1);
    expect(billableQuantity(l)).toBe(3);
  });

  it("derives the order status", () => {
    expect(orderStatus([line({})])).toBe(CustomerOrderStatus.OPEN);
    expect(orderStatus([line({ pickedQuantity: 5 })])).toBe(CustomerOrderStatus.OPEN);
    expect(orderStatus([line({ billedQuantity: 2 })])).toBe(CustomerOrderStatus.PARTLY_BILLED);
    expect(orderStatus([line({ billedQuantity: 3, cancelledQuantity: 2 })])).toBe(CustomerOrderStatus.BILLED);
    expect(orderStatus([line({ cancelledQuantity: 5 })])).toBe(CustomerOrderStatus.CANCELLED);
  });
});

describe("planIssue", () => {
  it("uses picked units first, then free stock", () => {
    expect(planIssue(line({ pickedQuantity: 2 }), 4, 10)).toEqual({ fromPicked: 2, fromStock: 2 });
    expect(planIssue(line({ pickedQuantity: 5 }), 3, 0)).toEqual({ fromPicked: 3, fromStock: 0 });
  });

  it("refuses to bill beyond the order or the stock", () => {
    expect(() => planIssue(line({ billedQuantity: 4 }), 2, 10)).toThrow(/Only 1 unit/);
    expect(() => planIssue(line({ pickedQuantity: 1 }), 3, 1)).toThrow(/Only 2 unit/);
  });
});

describe("returnableQuantity", () => {
  it("is what was billed less what already came back", () => {
    expect(returnableQuantity({ quantity: 3, returnedQuantity: 1 })).toBe(2);
  });
});
