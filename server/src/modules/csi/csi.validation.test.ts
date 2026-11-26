import {
  attributeBody,
  cardCreateBody,
  cardUpdateBody,
  responseBody,
} from "./csi.validation";

const id = "61616161-6161-4161-8161-616161616161";
const other = "62626262-6262-4262-8262-626262626262";
const base = { code: " c1 ", description: "Regular service", active: true };
const card = {
  ...base,
  cardDate: "2026-11-23",
  effectiveDate: "2026-12-01",
  appliesTo: "BOTH",
  attributes: [
    { attributeId: id, weightage: "0.035" },
    { attributeId: other, weightage: "0.965" },
  ],
  responses: [
    { responseId: id, marks: "5" },
    { responseId: other, marks: "1" },
  ],
};

describe("CSI master validation", () => {
  test("normalizes code and accepts an exact decimal weight total", () => {
    expect(cardCreateBody.parse(card).code).toBe("C1");
  });

  test.each(["malformed", "0.964999", "1.000001"])(
    "rejects an invalid weight or total (%s)",
    (weightage) => {
      expect(
        cardCreateBody.safeParse({
          ...card,
          attributes: [card.attributes[0], { attributeId: other, weightage }],
        }).success,
      ).toBe(false);
    },
  );

  test("rejects missing, repeated or insufficient choices", () => {
    expect(cardCreateBody.safeParse({ ...card, attributes: [] }).success).toBe(
      false,
    );
    expect(
      cardCreateBody.safeParse({ ...card, responses: [card.responses[0]] })
        .success,
    ).toBe(false);
    expect(
      cardCreateBody.safeParse({
        ...card,
        responses: [card.responses[0], card.responses[0]],
      }).success,
    ).toBe(false);
    expect(
      cardCreateBody.safeParse({
        ...card,
        attributes: card.attributes.map((row) => ({ ...row, attributeId: id })),
      }).success,
    ).toBe(false);
  });

  test("rejects untrusted fields, invalid calendar dates and absent revision tokens", () => {
    expect(cardCreateBody.safeParse({ ...card, branchId: id }).success).toBe(
      false,
    );
    expect(
      cardCreateBody.safeParse({ ...card, cardDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(cardUpdateBody.safeParse(card).success).toBe(false);
    expect(cardUpdateBody.safeParse({ ...card, version: 1 }).success).toBe(
      true,
    );
  });

  test("preserves leading zero codes and validates master decimal bounds", () => {
    expect(responseBody.parse({ ...base, code: "01", marks: "5" }).code).toBe(
      "01",
    );
    expect(responseBody.safeParse({ ...base, marks: "0" }).success).toBe(false);
    expect(
      attributeBody.safeParse({
        ...base,
        shortDescription: "Appointment",
        weightage: "1.01",
      }).success,
    ).toBe(false);
  });
});
