import {
  DEFAULT_MOBIS_PRICING,
  PricedPart,
  cleanBulletinLines,
  dealerRateFromList,
  planBulletin,
  readPricing,
  retailRateFor,
  revaluationRatio,
} from "./mobis-pricing.logic";

const part = (over: Partial<PricedPart>): PricedPart => ({
  id: "p1",
  partNumber: "223112X200",
  name: "GASKET-CYLINDER HEAD",
  partFlag: "O",
  priceCategoryCode: "C",
  unitPrice: 49098.42,
  retailRate: 163497.74,
  multiplier: 3.33,
  ...over,
});

describe("Mobis pricing settings", () => {
  it("defaults to 2700 and 0.616, and ignores invalid stored values", () => {
    expect(readPricing(undefined)).toEqual({ conversionRate: 2700, dealerFactor: 0.616 });
    expect(readPricing({ conversionRate: 2900, dealerFactor: -1 })).toEqual({ conversionRate: 2900, dealerFactor: 0.616 });
    expect(readPricing("x")).toEqual(DEFAULT_MOBIS_PRICING);
  });
});

describe("dealer and retail rates", () => {
  it("follows the DateManager script: list x 2700 x 0.616 = ₦1,663.20 per dollar", () => {
    expect(dealerRateFromList(29.33, DEFAULT_MOBIS_PRICING)).toBe(48781.66);
    expect(dealerRateFromList(4.4, DEFAULT_MOBIS_PRICING)).toBe(7318.08);
  });

  it("derives retail from the category multiplier, else keeps the part's markup", () => {
    expect(retailRateFor(1000, 3.33, { dealer: 900, retail: 1800 })).toBe(3330);
    expect(retailRateFor(1000, null, { dealer: 800, retail: 2000 })).toBe(2500);
    expect(retailRateFor(1000, null, { dealer: 0, retail: null })).toBeNull();
  });
});

describe("bulletin plan", () => {
  it("keeps one line per part (the higher price) and drops blanks", () => {
    expect(cleanBulletinLines([
      { partNumber: " 223112x200 ", listPrice: 30 },
      { partNumber: "223112X200", listPrice: 32.26 },
      { partNumber: "", listPrice: 5 },
      { partNumber: "X1", listPrice: 0 },
    ])).toEqual([{ partNumber: "223112X200", listPrice: 32.26 }]);
  });

  it("raises only parts whose dealer rate goes up (06-Nov-2026 bulletin lines)", () => {
    const plan = planBulletin(
      [
        { partNumber: "223112X200", listPrice: 32.26 }, // 29.33 → 32.26: up
        { partNumber: "0JE1514302", listPrice: 4.36 }, // 4.40 → 4.36: down, left alone
        { partNumber: "NOT-IN-MASTER", listPrice: 10 },
      ],
      [part({}), part({ id: "p2", partNumber: "0JE1514302", priceCategoryCode: "A", unitPrice: 7365.6, retailRate: 15246.79, multiplier: 2.07 })],
      DEFAULT_MOBIS_PRICING,
    );
    expect(plan.summary).toEqual({ lines: 3, increase: 1, notHigher: 1, notFound: 1 });
    expect(plan.rows[0]).toMatchObject({ status: "INCREASE", oldDealerRate: 49098.42, newDealerRate: 53654.83, newRetailRate: 178670.58 });
    expect(plan.rows[1]).toMatchObject({ status: "NOT_HIGHER", newDealerRate: 7251.55, newRetailRate: 15246.79 });
    expect(plan.rows[2]).toMatchObject({ status: "NOT_FOUND", partId: null });
  });
});

describe("rate change revaluation", () => {
  it("scales by new / old rate, and never downwards", () => {
    expect(revaluationRatio(1900, 2700)).toBeCloseTo(1.421, 3); // legacy 26 Aug 2024
    expect(revaluationRatio(2700, 2500)).toBeNull();
    expect(revaluationRatio(2700, 2700)).toBeNull();
  });
});
