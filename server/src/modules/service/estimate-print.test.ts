import { projectEstimatePrint } from "./estimate-print";
import { Prisma } from "@prisma/client";

it("prints the decimal-rounded recommendation for the saved estimate revision", () => {
  const source = {
    id: "estimate",
    version: 1,
    estimateNumber: "E1",
    estimateDate: null,
    createdAt: new Date(),
    description: "Repair",
    status: "Pending",
    currency: "NGN",
    amount: 100.01,
    // VAT 0 keeps the customer total at 100.01, so the advance is 60% of it.
    vatRate: 0,
    upfrontPaymentPercent: new Prisma.Decimal(60),
    successor: null,
    approvals: [],
    lines: [{ type: "PART", referenceId: "part", description: "Filter", quantity: 1, rate: 100.01, amount: 100.01 }],
  };
  expect(projectEstimatePrint(source, new Map())).toMatchObject({
    upfrontPaymentPercent: 60,
    upfrontAmount: 60.01,
  });
  expect(
    projectEstimatePrint(
      { ...source, upfrontPaymentPercent: new Prisma.Decimal(33.33) },
      new Map(),
    ),
  ).toMatchObject({ upfrontPaymentPercent: 33.33, upfrontAmount: 33.33 });
});
test("print projection excludes internal fields and unrelated estimates", () => {
  const source = {
    id: "e",
    version: 2,
    estimateNumber: "2026000001",
    estimateDate: null,
    createdAt: new Date(),
    description: "internal description",
    status: "SUPERSEDED",
    currency: "NGN",
    amount: 100,
    successor: { version: 3 },
    approvals: [],
    lines: [
      {
        type: "PART",
        referenceId: "p",
        description: "Part",
        quantity: 1,
        rate: 100,
        amount: 100,
        source: "IPO",
        cost: 50,
        chargeType: "WARRANTY",
      },
      {
        type: "COMPLAINT",
        description: "Customer complaint",
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ],
    customerRemarks: "Customer explanation",
    remarks: "Secret",
    qc: "FAILED",
    assignments: ["staff"],
    estimates: ["other"],
  };
  const result = projectEstimatePrint(source, new Map([["p", "PART-001"]]));
  expect(result.supersededBy).toBe(3);
  expect(result.lines).toHaveLength(1);
  expect(result.lines[0].code).toBe("PART-001");
  const json = JSON.stringify(result);
  for (const field of [
    "source",
    "cost",
    "chargeType",
    "remarks",
    "qc",
    "assignments",
    "estimates",
  ])
    expect(json).not.toContain('"' + field + '":');
  expect(json).not.toContain("Secret");
  expect(result.signature).toBeNull();
  expect(result.customerRemarks).toBe("Customer explanation");
});
