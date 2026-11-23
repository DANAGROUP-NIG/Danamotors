import { ChargeType } from "@prisma/client";
import {
  assertPartSubstitution,
  partFamilyId,
  requisitionPartRate,
} from "./part-substitution";
import {
  requisitionBody,
  requisitionPartOptionsSchema,
} from "./requisition.validation";

const main = { id: "main", mainPartId: null, sourceOfPartId: null };
const alternate = { id: "alternate", mainPartId: "main", sourceOfPartId: null };
const source = { id: "source", mainPartId: null, sourceOfPartId: "main" };
it("permits registered family substitutes with a reason and preserves legacy requests", () => {
  expect(partFamilyId(source)).toBe("main");
  expect(() =>
    assertPartSubstitution(alternate, main, "Unavailable"),
  ).not.toThrow();
  expect(() =>
    assertPartSubstitution(source, alternate, "Customer approved source"),
  ).not.toThrow();
  expect(() => assertPartSubstitution(main, undefined)).not.toThrow();
  expect(() => assertPartSubstitution(main, main)).not.toThrow();
  expect(() => assertPartSubstitution(alternate, main, " ")).toThrow("reason");
  expect(() =>
    assertPartSubstitution({ ...main, id: "unrelated" }, main, "Unavailable"),
  ).toThrow("registered");
});
it("quotes the issuance fallback while retaining explicit zero warranty rates", () => {
  const part = { unitPrice: 90.12, retailRate: null, warrantyRate: null };
  expect(requisitionPartRate(part, ChargeType.CUSTOMER)).toBe(90.12);
  expect(
    requisitionPartRate({ ...part, retailRate: 100.11 }, ChargeType.WARRANTY),
  ).toBe(100.11);
  expect(
    requisitionPartRate({ ...part, warrantyRate: 0 }, ChargeType.WARRANTY),
  ).toBe(0);
});
it("requires a traced reason for a changed part and bounds options queries", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const actual = "22222222-2222-4222-8222-222222222222";
  const line = { sparePartId: actual, quantityRequired: 1, quantityIssued: 0 };
  const body = {
    branchId: id,
    jobCardId: id,
    chargeType: "CUSTOMER",
    lines: [line],
  };
  expect(requisitionBody.safeParse(body).success).toBe(true);
  expect(
    requisitionBody.safeParse({
      ...body,
      lines: [{ ...line, requestedSparePartId: id }],
    }).success,
  ).toBe(false);
  expect(
    requisitionBody.safeParse({
      ...body,
      lines: [
        {
          ...line,
          requestedSparePartId: id,
          substitutionReason: "Unavailable",
        },
      ],
    }).success,
  ).toBe(true);
  expect(
    requisitionPartOptionsSchema.safeParse({
      query: { partId: id, branchId: id, limit: 101 },
    }).success,
  ).toBe(false);
  expect(
    requisitionPartOptionsSchema.safeParse({
      query: { partId: id, branchId: id, source: "UNKNOWN" },
    }).success,
  ).toBe(false);
});
