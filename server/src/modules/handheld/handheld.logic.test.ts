import { HandheldDocumentType, HandheldShortReason } from "@prisma/client";
import {
  canonicalJson,
  describeOutcome,
  isStationOnline,
  newStationSecret,
  nextDeviceName,
  parseStationKey,
  permissionsOf,
  planUpload,
  resultFingerprint,
  resultHash,
  secretMatches,
} from "./handheld.logic";

const { INDENT_PICK, CPO_PICK, MIT_RECEIVE, COUNT_SHEET } = HandheldDocumentType;

// Legacy BI 2026000009 on the device: 8659028000 x10 and a second line x1.
const pick = [
  { id: "a", lineNumber: 1, partNumber: "8659028000", expectedQuantity: 10 },
  { id: "b", lineNumber: 2, partNumber: "86591D4000", expectedQuantity: 1 },
];

// Legacy MIT 2026000005, case SPD2APD00183.
const mit = [
  { id: "m1", lineNumber: 1, partNumber: "98360F2500", expectedQuantity: 1 },
  { id: "m2", lineNumber: 2, partNumber: "97701Q6300", expectedQuantity: 2 },
];

describe("planUpload: picking", () => {
  it("accepts a full pick with nothing to release", () => {
    const plan = planUpload(INDENT_PICK, pick, [
      { lineId: "a", quantity: 10 },
      { lineId: "b", quantity: 1 },
    ]);
    expect(plan.lines.map((l) => [l.quantity, l.short, l.shortReason])).toEqual([[10, 0, null], [1, 0, null]]);
    expect(plan.totals).toMatchObject({ expected: 11, quantity: 11, short: 0, unreported: 0 });
  });

  it("releases a short pick and keeps its reason", () => {
    const plan = planUpload(CPO_PICK, pick, [
      { lineId: "a", quantity: 7, shortReason: HandheldShortReason.LESS_IN_BIN },
      { lineId: "b", quantity: 1 },
    ]);
    expect(plan.lines[0]).toMatchObject({ quantity: 7, short: 3, shortReason: "LESS_IN_BIN" });
    expect(plan.totals.short).toBe(3);
  });

  it("refuses a short line without a reason", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 9 }])).toThrow(/reason for picking 9 of 10/);
  });

  it("refuses picking more than reserved (legacy hard limit)", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 11 }])).toThrow(/11 picked but only 10 reserved/);
  });

  it("counts a line never saved on the device as not picked", () => {
    const plan = planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 10 }]);
    expect(plan.lines[1]).toMatchObject({ quantity: 0, short: 1, shortReason: "NOT_FOUND" });
    expect(plan.totals.unreported).toBe(1);
  });

  it("keeps a substitute scan as a note without counting it", () => {
    // Legacy 2025: 503103E101 ordered, 503103E102 picked.
    const plan = planUpload(INDENT_PICK, pick, [
      { lineId: "a", quantity: 0, shortReason: HandheldShortReason.OTHER, scannedPartNumber: " 503103E102 " },
      { lineId: "b", quantity: 1 },
    ]);
    expect(plan.lines[0]).toMatchObject({ quantity: 0, short: 10, scannedPartNumber: "503103E102" });
  });

  it("refuses damaged quantities and extra parts on a pick", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 10, damagedQuantity: 1 }])).toThrow(/only when receiving/);
    expect(() => planUpload(CPO_PICK, pick, [{ lineId: "a", quantity: 10 }], [{ partNumber: "X", quantity: 1 }])).toThrow(/Only an MIT/);
  });

  it("refuses unknown and repeated lines and an empty upload", () => {
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "z", quantity: 1 }])).toThrow(/not on this document/);
    expect(() => planUpload(INDENT_PICK, pick, [{ lineId: "a", quantity: 10 }, { lineId: "a", quantity: 10 }])).toThrow(/more than once/);
    expect(() => planUpload(INDENT_PICK, pick, [])).toThrow(/Nothing was recorded/);
  });
});

describe("planUpload: MIT receiving", () => {
  it("records received and damaged and leaves an unreached line unverified", () => {
    const plan = planUpload(MIT_RECEIVE, mit, [{ lineId: "m2", quantity: 1, damagedQuantity: 1 }]);
    expect(plan.lines.map((l) => [l.quantity, l.damagedQuantity, l.short])).toEqual([[null, 0, 0], [1, 1, 0]]);
    expect(plan.totals).toMatchObject({ quantity: 1, damaged: 1, unreported: 1 });
  });

  it("refuses more than the invoice quantity, as the MRN does", () => {
    expect(() => planUpload(MIT_RECEIVE, mit, [{ lineId: "m1", quantity: 1, damagedQuantity: 1 }])).toThrow(/2 received but the invoice has 1/);
  });

  it("keeps parts not on the MIT as extras (legacy newpart)", () => {
    const plan = planUpload(MIT_RECEIVE, mit, [{ lineId: "m1", quantity: 1 }], [{ partNumber: " 96621P2600 ", quantity: 1, note: "case 183" }]);
    expect(plan.extras).toEqual([{ partNumber: "96621P2600", quantity: 1, note: "case 183" }]);
  });

  it("refuses an extra part with no quantity", () => {
    expect(() => planUpload(MIT_RECEIVE, mit, [], [{ partNumber: "X", quantity: 0 }])).toThrow(/above zero/);
  });
});

describe("job permissions", () => {
  it("uses the permissions of the screen the job stands in for", () => {
    expect(permissionsOf(INDENT_PICK)).toEqual({ read: "transfer:read", write: "transfer:dispatch" });
    expect(permissionsOf(CPO_PICK)).toEqual({ read: "partsale:read", write: "partsale:order" });
    expect(permissionsOf(MIT_RECEIVE)).toEqual({ read: "stock:read", write: "stock:update" });
    expect(permissionsOf(COUNT_SHEET)).toEqual({ read: "stocktake:read", write: "stocktake:manage" });
    expect(permissionsOf(COUNT_SHEET, true)).toEqual({ read: "stockaudit:read", write: "stockaudit:manage" });
  });
});

describe("station keys", () => {
  it("issues a key whose secret is stored only as a hash", () => {
    const key = newStationSecret();
    expect(key.secret.length).toBeGreaterThanOrEqual(40);
    expect(key.prefix).toBe(key.secret.slice(0, 8));
    expect(key.hash).not.toContain(key.secret);
    expect(secretMatches(key.secret, key.hash)).toBe(true);
    expect(secretMatches(`${key.secret}x`, key.hash)).toBe(false);
  });

  it("reads the Station authorization header only", () => {
    const id = "6b1c7c2e-8a35-4f1e-9d5e-3f2a1b0c9d8e";
    expect(parseStationKey(`Station ${id}.abcdefghijklmnopqrstuvwxyz_-12`)).toEqual({ stationId: id, secret: "abcdefghijklmnopqrstuvwxyz_-12" });
    expect(parseStationKey(`Bearer ${id}.abcdefghijklmnopqrstuvwxyz`)).toBeNull();
    expect(parseStationKey(`Station ${id}.short`)).toBeNull();
    expect(parseStationKey(undefined)).toBeNull();
  });
});

describe("station online and handheld names", () => {
  it("takes a station as offline after 2 minutes without a heartbeat", () => {
    const now = new Date("2026-10-28T10:00:00Z");
    expect(isStationOnline(new Date("2026-10-28T09:58:30Z"), now)).toBe(true);
    expect(isStationOnline(new Date("2026-10-28T09:57:59Z"), now)).toBe(false);
    expect(isStationOnline(null, now)).toBe(false);
  });

  it("names a new handheld after the free number of its branch", () => {
    expect(nextDeviceName([])).toBe("MC3190-1");
    expect(nextDeviceName(["MC3190-1", "mc3190-3"])).toBe("MC3190-2");
  });
});

describe("result hash", () => {
  it("is the same whatever the key order, and differs when a value differs", () => {
    const a = { lines: [{ lineId: "a", quantity: 7, shortReason: "LESS_IN_BIN" }], extras: [] };
    const b = { extras: [], lines: [{ shortReason: "LESS_IN_BIN", quantity: 7, lineId: "a" }] };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(resultHash(a)).toBe(resultHash(b));
    expect(resultHash({ ...a, lines: [{ lineId: "a", quantity: 8, shortReason: "LESS_IN_BIN" }] })).not.toBe(resultHash(a));
    // Line order is part of the result.
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("ignores a count sheet's times (the station stamps them when the device clock is wrong)", () => {
    const first = { entries: [{ partNumber: "2630035505", binLocation: "N-3A1", quantity: 38, countedAt: "2026-10-28T09:15:00.000Z" }] };
    const repeat = { entries: [{ partNumber: "2630035505", binLocation: "N-3A1", quantity: 38, countedAt: "2026-10-28T09:40:00.000Z" }] };
    expect(resultFingerprint("SHEET", first)).toBe(resultFingerprint("SHEET", repeat));
    expect(resultFingerprint("SHEET", first)).not.toBe(resultFingerprint("SHEET", { entries: [{ ...first.entries[0], quantity: 37 }] }));
    expect(resultFingerprint("DOC", first)).not.toBe(resultFingerprint("DOC", repeat));
  });
});

describe("finished notice", () => {
  it("says what came back from the handheld", () => {
    expect(describeOutcome(CPO_PICK, { lines: 3, short: 1, unreported: 1 })).toBe("was picked on the handheld: 2 line(s) short");
    expect(describeOutcome(INDENT_PICK, { lines: 3 })).toBe("was picked on the handheld: all picked");
    expect(describeOutcome(MIT_RECEIVE, { lines: 5 })).toBe("was checked on the handheld: all as invoiced");
    expect(describeOutcome(MIT_RECEIVE, { lines: 5, differences: 1, unreported: 2, extras: 1 })).toBe(
      "was checked on the handheld: 1 line(s) differ from the invoice, 2 line(s) not checked, 1 part(s) not on the MIT",
    );
    expect(describeOutcome(COUNT_SHEET, { lines: 40, counted: 38 })).toBe("was counted on the handheld: 38 of 40 part(s) counted");
  });
});
