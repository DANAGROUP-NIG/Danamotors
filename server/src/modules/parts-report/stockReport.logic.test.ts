import { bandLabels, bandOf, StockValuation, untrackedOpening } from "./stockReport.logic";

const day = (d: string) => new Date(`${d}T10:00:00+01:00`);

describe("StockValuation (FIFO)", () => {
  // CPD 54530H9100 BALL JOINT ASSY-LWR ARM, Stock Ledger Revised from 27/02/26.
  function ballJoint() {
    const stock = new StockValuation("FIFO", 39258);
    stock.receive(1, 39258, day("2026-02-23"));
    stock.receive(6, 37314, day("2026-02-27"));
    stock.receive(2, 39258, day("2026-02-27"));
    return stock;
  }

  it("issues the oldest receipt first, one piece per rate", () => {
    const stock = ballJoint();
    expect(stock.value).toBe(341658);
    // STN 000080 (03/03/26): one unit at 39,258 and one at 37,314.
    expect(stock.issue(2)).toEqual([
      { quantity: 1, rate: 39258, value: 39258 },
      { quantity: 1, rate: 37314, value: 37314 },
    ]);
    expect(stock.quantity).toBe(7);
    expect(stock.value).toBe(265086);
  });

  it("keeps the newest receipts in stock", () => {
    const stock = ballJoint();
    stock.issue(6);
    expect(stock.stock).toEqual([
      { quantity: 1, rate: 37314, date: day("2026-02-27") },
      { quantity: 2, rate: 39258, date: day("2026-02-27") },
    ]);
  });

  it("merges consecutive pieces at the same rate", () => {
    const stock = new StockValuation("FIFO", 8829);
    stock.receive(1, 8829, null);
    stock.receive(200, 8829, day("2026-01-08"));
    expect(stock.issue(30)).toEqual([{ quantity: 30, rate: 8829, value: 264870 }]);
  });

  it("issues at value 0 when there is no stock, and makes the shortfall good from the next receipt", () => {
    const stock = new StockValuation("FIFO", 100);
    expect(stock.issue(3)).toEqual([{ quantity: 3, rate: 0, value: 0 }]);
    expect(stock.quantity).toBe(-3);
    expect(stock.value).toBe(0);
    stock.receive(5, 120, day("2026-06-04"));
    expect(stock.quantity).toBe(2);
    expect(stock.value).toBe(240);
  });

  it("applies signed movements: receipts at their rate, issues at cost", () => {
    const stock = new StockValuation("FIFO", 100);
    expect(stock.apply(4, 156762, day("2026-01-02"))).toEqual([{ quantity: 4, rate: 156762, value: 627048 }]);
    expect(stock.apply(-3, 999, day("2026-01-05"))).toEqual([{ quantity: 3, rate: 156762, value: 470286 }]);
    expect(stock.apply(0, 1, day("2026-01-05"))).toEqual([]);
  });
});

describe("StockValuation (dealer rate)", () => {
  it("values every unit, received or issued, at the dealer rate", () => {
    const stock = new StockValuation("DEALER", 4700);
    expect(stock.apply(6, 10000, day("2026-03-01"))).toEqual([{ quantity: 6, rate: 4700, value: 28200 }]);
    expect(stock.issue(8)).toEqual([{ quantity: 8, rate: 4700, value: 37600 }]);
    expect(stock.quantity).toBe(-2);
    expect(stock.value).toBe(-9400);
  });
});

describe("untrackedOpening", () => {
  it("is the stock the movements on record do not explain", () => {
    expect(untrackedOpening(10, [{ quantity: 4 }, { quantity: -2 }])).toBe(8);
    expect(untrackedOpening(0, [{ quantity: 3 }])).toBe(-3);
    expect(untrackedOpening(5, [])).toBe(5);
  });
});

describe("bandLabels", () => {
  it("labels five limits as six bands", () => {
    expect(bandLabels([30, 60, 90, 180, 365])).toEqual([
      "0–30 days",
      "31–60 days",
      "61–90 days",
      "91–180 days",
      "181–365 days",
      "Above 365 days",
    ]);
  });
});

describe("bandOf", () => {
  it("puts a value in the first band whose limit it does not pass", () => {
    const limits = [10000, 20000, 40000, 60000, 100000];
    expect([0, 10000, 10001, 59999, 100000, 100001].map((km) => bandOf(km, limits))).toEqual([0, 0, 1, 3, 4, 5]);
    expect(bandLabels(limits, "km")[5]).toBe("Above 100000 km");
  });
});
