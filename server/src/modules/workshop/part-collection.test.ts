import { collectionContentHash } from "./part-collection";

it("binds collection evidence to the issuance, actor, timestamp and drawn image", () => {
  const issue = {
    id: "issue",
    jobCardId: "job",
    sparePartId: "part",
    quantity: 2,
    partSource: "O",
  };
  const signedAt = new Date("2026-11-17T12:00:00Z");
  const original = collectionContentHash(issue, "tech", signedAt, "signature");
  expect(
    collectionContentHash({ ...issue }, "tech", signedAt, "signature"),
  ).toBe(original);
  for (const changed of [
    { id: "other" },
    { jobCardId: "other" },
    { sparePartId: "other" },
    { quantity: 3 },
    { partSource: "L" },
  ]) {
    expect(
      collectionContentHash(
        { ...issue, ...changed },
        "tech",
        signedAt,
        "signature",
      ),
    ).not.toBe(original);
  }
  expect(collectionContentHash(issue, "other", signedAt, "signature")).not.toBe(
    original,
  );
  expect(
    collectionContentHash(
      issue,
      "tech",
      new Date("2026-11-17T12:01:00Z"),
      "signature",
    ),
  ).not.toBe(original);
  expect(collectionContentHash(issue, "tech", signedAt, "changed")).not.toBe(
    original,
  );
});
