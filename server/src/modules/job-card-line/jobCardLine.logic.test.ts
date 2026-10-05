import { assertChargeChange, chargeTotals, defaultChargeType } from "./jobCardLine.logic";

describe("defaultChargeType", () => {
  const base = { kind: "PART" as const, coverageAtCreation: "ACTIVE" as const, hasWarrantyCase: false, partWarrantyApplicable: true, campaignMatchId: null };

  it("charges a covered vehicle's warranty-applicable part to warranty", () => {
    expect(defaultChargeType(base)).toEqual({ chargeType: "WARRANTY", campaignId: null });
  });
  it("charges a part that is not warranty-applicable to the customer", () => {
    expect(defaultChargeType({ ...base, partWarrantyApplicable: false }).chargeType).toBe("CUSTOMER");
  });
  it("charges work covered by a linked campaign as free", () => {
    expect(defaultChargeType({ ...base, campaignMatchId: "c1" })).toEqual({ chargeType: "FREE", campaignId: "c1" });
  });
  it("charges the customer when the vehicle was not covered", () => {
    expect(defaultChargeType({ ...base, coverageAtCreation: "UNKNOWN" }).chargeType).toBe("CUSTOMER");
    expect(defaultChargeType({ ...base, coverageAtCreation: "EXPIRED_MILEAGE" }).chargeType).toBe("CUSTOMER");
  });
  it("treats a manually opened warranty case as covered", () => {
    expect(defaultChargeType({ ...base, coverageAtCreation: "UNKNOWN", hasWarrantyCase: true }).chargeType).toBe("WARRANTY");
  });
  it("defaults labour to the customer", () => {
    expect(defaultChargeType({ ...base, kind: "LABOUR", partWarrantyApplicable: null }).chargeType).toBe("CUSTOMER");
  });
});

describe("assertChargeChange", () => {
  const base = {
    kind: "PART" as const,
    coverageAtCreation: "ACTIVE" as const,
    hasWarrantyCase: false,
    partWarrantyApplicable: true,
    linkedCampaignIds: ["c1"],
    canChargeGoodwill: false,
  };

  it("allows warranty only for covered vehicles and warranty-applicable parts", () => {
    expect(assertChargeChange({ ...base, to: "WARRANTY" })).toEqual({ campaignId: null });
    expect(() => assertChargeChange({ ...base, to: "WARRANTY", partWarrantyApplicable: false })).toThrow(/not warranty-applicable/);
    expect(() => assertChargeChange({ ...base, to: "WARRANTY", coverageAtCreation: "EXPIRED_DATE" })).toThrow(/not under warranty/);
    expect(assertChargeChange({ ...base, kind: "LABOUR", to: "WARRANTY", partWarrantyApplicable: null })).toEqual({ campaignId: null });
  });

  it("restricts goodwill to warranty:update holders", () => {
    expect(() => assertChargeChange({ ...base, to: "GOODWILL" })).toThrow(/goodwill/);
    expect(assertChargeChange({ ...base, to: "GOODWILL", canChargeGoodwill: true })).toEqual({ campaignId: null });
  });

  it("charges free lines to a linked campaign", () => {
    expect(assertChargeChange({ ...base, to: "FREE" })).toEqual({ campaignId: "c1" });
    expect(() => assertChargeChange({ ...base, to: "FREE", linkedCampaignIds: [] })).toThrow(/no linked campaign/);
    expect(() => assertChargeChange({ ...base, to: "FREE", linkedCampaignIds: ["c1", "c2"] })).toThrow(/Choose which campaign/);
    expect(() => assertChargeChange({ ...base, to: "FREE", campaignId: "other" })).toThrow(/not linked/);
  });
});

describe("chargeTotals", () => {
  it("invoices only customer lines, with VAT on taxable customer lines", () => {
    const totals = chargeTotals([
      { chargeType: "WARRANTY", amount: 64_300, taxable: true },
      { chargeType: "WARRANTY", amount: 150_000, taxable: true },
      { chargeType: "FREE", amount: 35_000, taxable: true },
      { chargeType: "CUSTOMER", amount: 38_500, taxable: true },
      { chargeType: "CUSTOMER", amount: 48_000, taxable: true },
      { chargeType: "GOODWILL", amount: 0, taxable: true },
    ]);
    expect(totals).toEqual({
      customer: 86_500,
      warranty: 214_300,
      goodwill: 0,
      free: 35_000,
      customerTax: 6_487.5,
      customerInvoiceTotal: 92_987.5,
    });
  });

  it("does not tax non-taxable lines", () => {
    expect(chargeTotals([{ chargeType: "CUSTOMER", amount: 100, taxable: false }]).customerInvoiceTotal).toBe(100);
  });
});
