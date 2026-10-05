import { CampaignVehicleStatus } from "@prisma/client";
import {
  VEHICLE_TRANSITIONS,
  assertVehicleTransition,
  buildProgress,
  coveredItemMatches,
  isCampaignOpen,
  parseVinList,
  partNumberMatches,
  statusAfterContact,
  vinError,
} from "./campaign.logic";

describe("VIN parsing", () => {
  it("validates length and characters", () => {
    expect(vinError("KNAPU81BDP7123456")).toBeNull();
    expect(vinError("KNAPU81BDP712")).toBe("must be 17 characters");
    expect(vinError("KNAOU81BDP7123456")).toBe("contains letter O");
    expect(vinError("KNAPU81BDP712345#")).toMatch(/other than letters and digits/);
  });

  it("normalises, de-duplicates and reports invalid lines by line number", () => {
    const parsed = parseVinList("knapu81bdp7123456\n\nKNDEU2A20P7654321\nKNAPU81BDP712\nKNAPU81BDP7123456\n KNDEU2A2-0P7654322 ");
    expect(parsed.valid).toEqual(["KNAPU81BDP7123456", "KNDEU2A20P7654321", "KNDEU2A20P7654322"]);
    expect(parsed.invalid).toEqual([{ line: 4, value: "KNAPU81BDP712", error: "must be 17 characters" }]);
    expect(parsed.duplicatesInInput).toBe(1);
  });

  it("accepts comma separated VINs", () => {
    expect(parseVinList("KNAPU81BDP7123456, KNDEU2A20P7654321").valid).toHaveLength(2);
  });
});

describe("campaign vehicle transitions", () => {
  const statuses = Object.values(CampaignVehicleStatus);

  it.each(statuses.flatMap((from) => statuses.map((to) => [from, to] as const)))("%s → %s", (from, to) => {
    const allowed = VEHICLE_TRANSITIONS[from].includes(to);
    const run = () => assertVehicleTransition(from, to, { jobCardId: "jc" });
    if (allowed) expect(run).not.toThrow();
    else expect(run).toThrow();
  });

  it("completed is terminal and needs a job card", () => {
    expect(VEHICLE_TRANSITIONS.COMPLETED).toEqual([]);
    expect(() => assertVehicleTransition("SCHEDULED", "COMPLETED")).toThrow(/job card/);
  });

  it("reaching the customer marks a pending vehicle contacted", () => {
    expect(statusAfterContact("PENDING", "REACHED")).toBe("CONTACTED");
    expect(statusAfterContact("NOT_REACHABLE", "CALL_BACK")).toBe("CONTACTED");
    expect(statusAfterContact("PENDING", "NO_ANSWER")).toBe("PENDING");
    expect(statusAfterContact("SCHEDULED", "REACHED")).toBe("SCHEDULED");
  });
});

describe("campaign dates", () => {
  const campaign = { status: "ACTIVE" as const, startDate: new Date("2026-08-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z") };
  it("is open inside its dates only when active", () => {
    expect(isCampaignOpen(campaign, new Date("2026-09-30T12:00:00Z"))).toBe(true);
    expect(isCampaignOpen(campaign, new Date("2026-07-31T12:00:00Z"))).toBe(false);
    expect(isCampaignOpen(campaign, new Date("2027-01-01T12:00:00Z"))).toBe(false);
    expect(isCampaignOpen({ ...campaign, status: "DRAFT" }, new Date("2026-09-30T12:00:00Z"))).toBe(false);
    expect(isCampaignOpen({ ...campaign, endDate: null }, new Date("2030-01-01T12:00:00Z"))).toBe(true);
  });
});

describe("progress", () => {
  it("counts outstanding and percent complete, excluding not-applicable vehicles", () => {
    const p = buildProgress({ PENDING: 214, CONTACTED: 188, SCHEDULED: 46, COMPLETED: 412, NOT_APPLICABLE: 10 });
    expect(p).toMatchObject({ affected: 870, outstanding: 448, completed: 412, percentComplete: 47.9 });
    expect(buildProgress({}).percentComplete).toBe(0);
  });
});

describe("covered items", () => {
  it("matches part number prefixes ending in x or *", () => {
    expect(partNumberMatches("91200-D3xxx", "91200D3100")).toBe(true);
    expect(partNumberMatches("91200-D3*", "91200-D3999")).toBe(true);
    expect(partNumberMatches("91200-D3xxx", "91200D4100")).toBe(false);
    expect(partNumberMatches("27301-2B010", "273012B010")).toBe(true);
    expect(partNumberMatches("27301-2B010", "273012B011")).toBe(false);
  });

  it("matches labour by operation code, then description", () => {
    const item = { kind: "LABOUR" as const, partNumber: null, operationCode: "HRN-01", description: "Harness inspection" };
    expect(coveredItemMatches(item, { kind: "LABOUR", operationCode: "hrn01", description: "x" })).toBe(true);
    expect(coveredItemMatches({ ...item, operationCode: null }, { kind: "LABOUR", description: "harness inspection " })).toBe(true);
    expect(coveredItemMatches(item, { kind: "PART", partNumber: "HRN-01", description: "x" })).toBe(false);
  });
});
