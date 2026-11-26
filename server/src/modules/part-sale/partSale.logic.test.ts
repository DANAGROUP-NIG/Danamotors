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
    expect(totals).toEqual({ gross: 273313.81, tradeDiscount: 0, discount: 61495.61, handling: 0, vat: 15886.37, roundOff: -4.57, total: 227700 });
  });

  // Legacy Lagos bill 2024000016: 1 x 674,397.51, trade discount 8%, cash discount 22.2%, handling 9%, VAT 7.5%.
  it("reproduces a legacy Lagos bill with trade discount, cash discount and handling", () => {
    const { totals } = priceSale([{ quantity: 1, rate: 674397.51, vatPercent: 7.5, tradeDiscountPercent: 8, handlingPercent: 9 }], 22.2);
    expect(totals).toEqual({
      gross: 674397.51,
      tradeDiscount: 53951.8,
      discount: 137738.95,
      handling: 43443.61,
      vat: 39461.28,
      roundOff: -1.65,
      total: 565610,
    });
  });

  // Legacy Lagos bill 2024000006: two lines, cash discount 20%, handling 9% on each.
  it("reproduces a legacy Lagos bill with handling on several lines", () => {
    const { totals } = priceSale(
      [
        { quantity: 1, rate: 109286.48, vatPercent: 7.5, handlingPercent: 9 },
        { quantity: 1, rate: 23566.12, vatPercent: 7.5, handlingPercent: 9 },
      ],
      20,
    );
    expect(totals).toMatchObject({ gross: 132852.6, discount: 26570.52, handling: 9565.39, vat: 8688.56, total: 124530 });
  });

  // Legacy ABJ bill 2025000002: 1 x 130,608.61 with a 30% line discount, no cash discount or handling.
  it("reproduces a legacy ABJ bill with a line trade discount", () => {
    const { totals } = priceSale([{ quantity: 1, rate: 130608.61, vatPercent: 7.5, tradeDiscountPercent: 30 }], 0);
    expect(totals).toMatchObject({ tradeDiscount: 39182.58, vat: 6856.95, total: 98280 });
  });

  it("rejects out-of-range trade discount and handling", () => {
    expect(() => priceSale([{ quantity: 1, rate: 10, vatPercent: 0, tradeDiscountPercent: 101 }], 0)).toThrow(/Trade discount/);
    expect(() => priceSale([{ quantity: 1, rate: 10, vatPercent: 0, handlingPercent: -1 }], 0)).toThrow(/Handling/);
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
