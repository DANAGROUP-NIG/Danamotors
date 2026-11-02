import { CampaignStatus, CampaignVehicleStatus, ContactOutcome, type Prisma } from "@prisma/client";
import { addVehicleToRangeCampaigns, assertCampaignAttendance, completeCampaignVehiclesForJobCard } from "./campaign.hooks";
import {
  campaignsMissingAttendance,
  notAttendedReasonLabel,
  notAttendedReasonText,
  statusAfterContact,
  statusAfterNotAttended,
  vinInRange,
  vinRangeError,
  vinRangeSize,
} from "./campaign.logic";

const FROM = "KNAKU813DC5214595";
const TO = "KNAKU813DC5214616";

describe("VIN ranges", () => {
  it("accepts a range and a single VIN (from = to)", () => {
    expect(vinRangeError({ vinFrom: FROM, vinTo: TO })).toBeNull();
    expect(vinRangeError({ vinFrom: FROM, vinTo: FROM })).toBeNull();
  });

  it("rejects bad length or characters, naming the bound", () => {
    expect(vinRangeError({ vinFrom: "KNAKU813DC52145", vinTo: TO })).toBe("From VIN KNAKU813DC52145 must be 17 characters");
    expect(vinRangeError({ vinFrom: FROM, vinTo: "KNAKU813DC521461O" })).toBe("To VIN KNAKU813DC521461O contains letter O");
    expect(vinRangeError({ vinFrom: "", vinTo: TO })).toMatch(/^From VIN \(blank\)/);
  });

  it("rejects a reversed range", () => {
    expect(vinRangeError({ vinFrom: TO, vinTo: FROM })).toBe("From VIN must not come after To VIN");
  });

  it("rejects a range that spans more than the serial number", () => {
    expect(vinRangeError({ vinFrom: FROM, vinTo: "KNAKU813DD5214616" })).toMatch(/share the first 11 characters/);
  });

  it("matches VINs inside the range, bounds included", () => {
    const range = { vinFrom: FROM, vinTo: TO };
    expect(vinInRange(FROM, range)).toBe(true);
    expect(vinInRange("KNAKU813DC5214600", range)).toBe(true);
    expect(vinInRange(TO, range)).toBe(true);
    expect(vinInRange("KNAKU813DC5214594", range)).toBe(false);
    expect(vinInRange("KNAKU813DC5214617", range)).toBe(false);
    expect(vinInRange("KNAKU813DD5214600", range)).toBe(false);
  });

  it("counts the serials in a numeric range", () => {
    expect(vinRangeSize({ vinFrom: FROM, vinTo: TO })).toBe(22);
    expect(vinRangeSize({ vinFrom: FROM, vinTo: FROM })).toBe(1);
    expect(vinRangeSize({ vinFrom: "KNAKU813DC5A14595", vinTo: "KNAKU813DC5A14599" })).toBeNull();
  });
});

describe("attended on the job card", () => {
  it("stores the reason label, with an optional note", () => {
    expect(notAttendedReasonText("PARTS_NOT_AVAILABLE")).toBe("Parts not available");
    expect(notAttendedReasonText("PARTS_NOT_AVAILABLE", " back order ")).toBe("Parts not available: back order");
    expect(notAttendedReasonText("OTHER", "Customer in a hurry")).toBe("Other: Customer in a hurry");
  });

  it("counts stored text under its reason, unknown text as Other", () => {
    expect(notAttendedReasonLabel("Parts not available: back order")).toBe("Parts not available");
    expect(notAttendedReasonLabel("Customer declined")).toBe("Customer declined");
    expect(notAttendedReasonLabel("Something legacy")).toBe("Other");
    expect(notAttendedReasonLabel(null)).toBe("Not given");
  });

  it("needs an answer for every campaign except one pre-set by a FREE line", () => {
    const missing = campaignsMissingAttendance([
      { campaignId: "a", attended: null, hasFreeLine: false },
      { campaignId: "b", attended: null, hasFreeLine: true },
      { campaignId: "c", attended: false, hasFreeLine: false },
      { campaignId: "d", attended: true, hasFreeLine: false },
    ]);
    expect(missing.map((c) => c.campaignId)).toEqual(["a"]);
  });

  it("returns a not-attended vehicle to contacted when the customer was reached, else pending", () => {
    expect(statusAfterNotAttended(true)).toBe(CampaignVehicleStatus.CONTACTED);
    expect(statusAfterNotAttended(false)).toBe(CampaignVehicleStatus.PENDING);
  });

  it("does not change the status for a letter sent", () => {
    expect(statusAfterContact(CampaignVehicleStatus.PENDING, ContactOutcome.SENT)).toBe(CampaignVehicleStatus.PENDING);
    expect(statusAfterContact(CampaignVehicleStatus.PENDING, ContactOutcome.REACHED)).toBe(CampaignVehicleStatus.CONTACTED);
  });
});

// ── Hooks, against a minimal transaction double ───────────────────────────────

type Mock = jest.Mock;
function txDouble(overrides: Record<string, Record<string, Mock>>) {
  return overrides as unknown as Prisma.TransactionClient;
}

describe("adding range vehicles on registration", () => {
  it("adds the vehicle to active campaigns whose range contains its VIN", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { campaignId: "fpc-1", vinFrom: FROM, vinTo: TO },
      { campaignId: "fpc-2", vinFrom: "KNAKU813DC5214700", vinTo: "KNAKU813DC5214800" },
      { campaignId: "fpc-1", vinFrom: "KNAKU813DC5214600", vinTo: "KNAKU813DC5214600" },
    ]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = txDouble({ campaignVinRange: { findMany }, campaignVehicle: { createMany } });

    await expect(addVehicleToRangeCampaigns(db, { id: "veh-1", vin: "knaku813dc5214600" })).resolves.toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vinFrom: { startsWith: "KNAKU813DC5" }, campaign: { status: CampaignStatus.ACTIVE } } }),
    );
    expect(createMany).toHaveBeenCalledWith({ data: [{ campaignId: "fpc-1", vin: "KNAKU813DC5214600", vehicleId: "veh-1" }], skipDuplicates: true });
  });

  it("adds nothing when no active range contains the VIN", async () => {
    const createMany = jest.fn();
    const db = txDouble({ campaignVinRange: { findMany: jest.fn().mockResolvedValue([]) }, campaignVehicle: { createMany } });
    await expect(addVehicleToRangeCampaigns(db, { id: "veh-1", vin: FROM })).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("READY guard", () => {
  const campaigns = (rows: { campaignId: string; attended: boolean | null }[]) =>
    rows.map((r) => ({ ...r, campaignCode: r.campaignId.toUpperCase(), campaignTitle: "Fuel pump plate", notAttendedReason: null }));

  it("blocks READY with CAMPAIGN_ATTENDANCE_REQUIRED listing the open campaigns", async () => {
    const db = txDouble({
      jobCardCampaign: { findMany: jest.fn().mockResolvedValue(campaigns([{ campaignId: "fpc-1", attended: null }, { campaignId: "fpc-2", attended: true }])), updateMany: jest.fn() },
      jobCardLine: { findMany: jest.fn().mockResolvedValue([]) },
    });
    await expect(assertCampaignAttendance(db, "job-1", "user-1")).rejects.toMatchObject({
      statusCode: 409,
      code: "CAMPAIGN_ATTENDANCE_REQUIRED",
      details: [{ campaignId: "fpc-1", code: "FPC-1", title: "Fuel pump plate" }],
    });
  });

  it("records an unanswered campaign with a FREE line as done and lets READY through", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = txDouble({
      jobCardCampaign: { findMany: jest.fn().mockResolvedValue(campaigns([{ campaignId: "fpc-1", attended: null }])), updateMany },
      jobCardLine: { findMany: jest.fn().mockResolvedValue([{ campaignId: "fpc-1" }]) },
    });
    await expect(assertCampaignAttendance(db, "job-1", "user-1")).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      where: { jobCardId: "job-1", campaignId: { in: ["fpc-1"] }, attended: null },
      data: expect.objectContaining({ attended: true, attendedById: "user-1" }),
    });
  });
});

describe("completion at READY", () => {
  function setup(attendance: { campaignId: string; attended: boolean | null }[], rollbackRows: { id: string; reached: boolean }[] = []) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue(rollbackRows.map((r) => ({ id: r.id, contactLogs: r.reached ? [{ id: "log" }] : [] })));
    const db = txDouble({
      jobCard: { findUnique: jest.fn().mockResolvedValue({ vehicle: { id: "veh-1", vin: FROM }, campaigns: attendance }) },
      campaignVehicle: { updateMany, update, findMany },
    });
    return { db, updateMany, update, findMany };
  }

  it("completes only the campaigns marked attended", async () => {
    const { db, updateMany, findMany } = setup([{ campaignId: "done", attended: true }]);
    await expect(completeCampaignVehiclesForJobCard(db, "job-1")).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ campaignId: { in: ["done"] } }),
        data: expect.objectContaining({ status: CampaignVehicleStatus.COMPLETED, completedJobCardId: "job-1" }),
      }),
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns a not-attended vehicle to contacted or pending so the next job card flags it", async () => {
    const { db, updateMany, update } = setup(
      [{ campaignId: "not-done", attended: false }],
      [
        { id: "cv-reached", reached: true },
        { id: "cv-letter-only", reached: false },
      ],
    );
    await expect(completeCampaignVehiclesForJobCard(db, "job-1")).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: "cv-reached" }, data: { status: CampaignVehicleStatus.CONTACTED, completedAt: null, completedJobCardId: null } });
    expect(update).toHaveBeenCalledWith({ where: { id: "cv-letter-only" }, data: { status: CampaignVehicleStatus.PENDING, completedAt: null, completedJobCardId: null } });
  });

  it("does nothing for a job card without a vehicle or campaigns", async () => {
    const db = txDouble({ jobCard: { findUnique: jest.fn().mockResolvedValue({ vehicle: null, campaigns: [] }) } });
    await expect(completeCampaignVehiclesForJobCard(db, "job-1")).resolves.toBe(0);
  });
});
