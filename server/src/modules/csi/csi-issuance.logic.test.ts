import { csiJobApplicability, selectCsiRevision } from "./csi-issuance.logic";
import { generationBody, issuanceQuery } from "./csi-issuance.validation";

const revision = (
  id: string,
  day: string,
  appliesTo: "BOTH" | "ACCIDENTAL" | "NON_ACCIDENTAL" = "BOTH",
  version = 1,
) => ({ id, cardId: id, effectiveDate: new Date(day), appliesTo, version });
describe("CSI issuance rules", () => {
  it("uses the shared accidental category and does not classify unknown jobs as ordinary service", () => {
    expect(csiJobApplicability({ code: "AC" })).toBe("ACCIDENTAL");
    expect(csiJobApplicability({ code: "AC", category: "PAID" })).toBe(
      "NON_ACCIDENTAL",
    );
    expect(csiJobApplicability(null)).toBeNull();
  });
  it("uses the job-opening Lagos day and the latest applicable effective date", () => {
    const old = revision("old", "2026-01-01");
    const next = revision("next", "2026-02-01", "NON_ACCIDENTAL");
    expect(
      selectCsiRevision(
        [old, next],
        new Date("2026-01-31T23:30:00Z"),
        "NON_ACCIDENTAL",
      )?.id,
    ).toBe("next");
    expect(
      selectCsiRevision(
        [old, next],
        new Date("2026-01-31T12:00:00Z"),
        "NON_ACCIDENTAL",
      )?.id,
    ).toBe("old");
    expect(
      selectCsiRevision([next], new Date("2026-02-01"), "ACCIDENTAL"),
    ).toBeNull();
  });
  it("prefers specific applicability on the same day and later versions of the same card", () => {
    const both = revision("both", "2026-01-01");
    const specific = revision("specific", "2026-01-01", "ACCIDENTAL");
    expect(
      selectCsiRevision([both, specific], new Date("2026-02-01"), "ACCIDENTAL")
        ?.id,
    ).toBe("specific");
    expect(
      selectCsiRevision(
        [both, { ...both, id: "new-version", version: 2 }],
        new Date("2026-02-01"),
        null,
      )?.id,
    ).toBe("new-version");
  });
  it("refuses ambiguous equally applicable cards rather than issuing the wrong questionnaire", () => {
    expect(() =>
      selectCsiRevision(
        [revision("a", "2026-01-01"), revision("b", "2026-01-01")],
        new Date("2026-02-01"),
        null,
      ),
    ).toThrow("Several CSI cards");
  });
  it("validates bounded requests, dates, job ranges and dependent variants", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(generationBody.safeParse({ jobCardIds: [id, id] }).success).toBe(
      false,
    );
    expect(generationBody.safeParse({ jobCardIds: [] }).success).toBe(false);
    expect(issuanceQuery.safeParse({ from: "2026-01-01" }).success).toBe(false);
    expect(
      issuanceQuery.safeParse({ jobFrom: "20", jobTo: "10" }).success,
    ).toBe(false);
    expect(issuanceQuery.safeParse({ variantId: id }).success).toBe(false);
    expect(
      issuanceQuery.safeParse({ modelId: id, variantId: id }).success,
    ).toBe(true);
  });
});
