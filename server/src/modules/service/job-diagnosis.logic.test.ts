import { ROLES } from "../../shared/constants/roles";
import {
  allocationBody,
  availability,
  bayStates,
  canAllocate,
  canWorkDiagnosis,
  diagnosisRoute,
  diagnosisSubStep,
  findingBody,
  findingProblems,
  isReturned,
  itemQuantity,
  jobsInHand,
  sortTechnicians,
} from "./job-diagnosis.logic";

const TECH = "tech-1";
const technician = { id: TECH, role: ROLES.TECHNICIAN };
const otherTechnician = { id: "tech-2", role: ROLES.TECHNICIAN };
const supervisor = { id: "wm-1", role: ROLES.WORKSHOP_MANAGER };
const engineer = { id: "eng-1", role: ROLES.ENGINEER };
const advisor = { id: "sa-1", role: ROLES.SERVICE_ADVISOR };
const admin = { id: "admin-1", role: ROLES.ADMIN };

const route = (overrides: Partial<Parameters<typeof diagnosisRoute>[0]> = {}) =>
  diagnosisRoute({ coverageActive: false, openCampaigns: 0, warrantyCase: false, flaggedFindings: 0, ...overrides });

describe("diagnosis routing", () => {
  it("goes to the service advisor when nothing may be warranty", () => {
    expect(route()).toBe("ESTIMATE");
  });

  it.each([
    ["active coverage", { coverageActive: true }],
    ["an open campaign", { openCampaigns: 1 }],
    ["an existing warranty case", { warrantyCase: true }],
    ["a finding flagged possible warranty", { flaggedFindings: 1 }],
  ])("goes to the warranty officer for %s", (_label, overrides) => {
    expect(route(overrides)).toBe("WARRANTY");
  });
});

describe("sub-step and who works it", () => {
  const submitted = { submittedAt: new Date(), returnedAt: null };
  const returned = { submittedAt: null, returnedAt: new Date() };

  it("moves from assignment to findings to the engineer's review", () => {
    expect(diagnosisSubStep(null, null)).toBe("ASSIGN_TECHNICIAN");
    expect(diagnosisSubStep(TECH, null)).toBe("FINDINGS");
    expect(diagnosisSubStep(TECH, returned)).toBe("FINDINGS");
    expect(diagnosisSubStep(TECH, submitted)).toBe("ENGINEER_REVIEW");
  });

  it("shows the engineer's note only while the job is back with the technician", () => {
    expect(isReturned(returned)).toBe(true);
    expect(isReturned({ submittedAt: new Date(), returnedAt: new Date() })).toBe(false);
    expect(isReturned(null)).toBe(false);
  });

  it("lets only the supervisor assign", () => {
    expect(canWorkDiagnosis("ASSIGN_TECHNICIAN", supervisor, null)).toBe(true);
    expect(canWorkDiagnosis("ASSIGN_TECHNICIAN", technician, null)).toBe(false);
    expect(canWorkDiagnosis("ASSIGN_TECHNICIAN", advisor, null)).toBe(false);
    expect(canAllocate("FINDINGS", supervisor)).toBe(true);
    expect(canAllocate("ENGINEER_REVIEW", supervisor)).toBe(false);
    expect(canAllocate("FINDINGS", technician)).toBe(false);
  });

  it("lets the assigned technician (or the supervisor) record findings, never another technician", () => {
    expect(canWorkDiagnosis("FINDINGS", technician, TECH)).toBe(true);
    expect(canWorkDiagnosis("FINDINGS", otherTechnician, TECH)).toBe(false);
    expect(canWorkDiagnosis("FINDINGS", supervisor, TECH)).toBe(true);
    expect(canWorkDiagnosis("FINDINGS", engineer, TECH)).toBe(false);
    expect(canWorkDiagnosis("FINDINGS", advisor, TECH)).toBe(false);
  });

  it("gives the review to the engineer (or an admin) only", () => {
    expect(canWorkDiagnosis("ENGINEER_REVIEW", engineer, TECH)).toBe(true);
    expect(canWorkDiagnosis("ENGINEER_REVIEW", admin, TECH)).toBe(true);
    expect(canWorkDiagnosis("ENGINEER_REVIEW", technician, TECH)).toBe(false);
    expect(canWorkDiagnosis("ENGINEER_REVIEW", supervisor, TECH)).toBe(false);
  });
});

describe("findings gate", () => {
  const requests = ["c1", "c2", "c3"];
  const found = (complaintId: string | null, text = "Front pads worn to 2 mm") => ({ complaintId, causeAndDefect: text });

  it("passes when every request has words", () => {
    expect(findingProblems(requests, [found("c1"), found("c2"), found("c3")])).toEqual([]);
  });

  it("counts the requests still empty, ignoring blank text", () => {
    expect(findingProblems(requests, [found("c1"), found("c2", "   ")])).toEqual([
      "Write what you found for every customer request (2 of 3 still empty).",
    ]);
    expect(findingProblems(["c1"], [])).toEqual(["Write what you found for the customer request."]);
  });

  it("asks for words on an empty extra finding, or its removal", () => {
    expect(findingProblems(["c1"], [found("c1"), found(null, "")])).toEqual(["Describe each finding the customer did not mention, or remove it."]);
    expect(findingProblems(["c1"], [found("c1"), found(null)])).toEqual([]);
  });

  it("needs at least one finding on a job with no requests", () => {
    expect(findingProblems([], [])).toEqual(["Write at least one finding."]);
    expect(findingProblems([], [found(null)])).toEqual([]);
  });
});

describe("allocation load and bays", () => {
  it("adds up one grouped query's rows per technician", () => {
    const counts = jobsInHand([
      { technicianId: "a", count: 2 },
      { technicianId: "a", count: 1 },
      { technicianId: null, count: 9 },
      { technicianId: "b", count: 1 },
    ]);
    expect([...counts.entries()]).toEqual([["a", 3], ["b", 1]]);
  });

  it("shows Busy from 3 jobs in hand", () => {
    expect([0, 1, 2, 3, 4].map(availability)).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE", "BUSY", "BUSY"]);
  });

  it("lists available technicians first, then by load and name", () => {
    const sorted = sortTechnicians([
      { name: "Sani Yusuf", jobsInHand: 4 },
      { name: "Segun Anibaba", jobsInHand: 2 },
      { name: "Idris Bello", jobsInHand: 0 },
      { name: "Emeka Udo", jobsInHand: 3 },
      { name: "Musa Abdullahi", jobsInHand: 0 },
    ]);
    expect(sorted.map((row) => row.name)).toEqual(["Idris Bello", "Musa Abdullahi", "Segun Anibaba", "Emeka Udo", "Sani Yusuf"]);
  });

  it("marks a bay occupied by another job in the workshop, never by this job", () => {
    const bays = [
      { id: "b1", code: "A1", description: "Bay A1" },
      { id: "b2", code: "A2", description: "Bay A2" },
      { id: "b3", code: "A3", description: "Bay A3" },
    ];
    const open = [
      { bayId: "b1", jobCardId: "j9", jobNumber: "2026000009" },
      { bayId: "b1", jobCardId: "j4", jobNumber: "2026000004" },
      { bayId: "b2", jobCardId: "this", jobNumber: "2026000127" },
      { bayId: null, jobCardId: "j5", jobNumber: "2026000005" },
    ];
    expect(bayStates(bays, open, "this").map((bay) => [bay.code, bay.occupiedBy])).toEqual([
      ["A1", "2026000004"],
      ["A2", null],
      ["A3", null],
    ]);
  });
});

describe("input validation names the field and the fix", () => {
  const valid = {
    complaintId: "11111111-1111-4111-8111-111111111111",
    causeAndDefect: "Front pads worn to 2 mm",
    possibleWarranty: false,
    items: [{ kind: "PART", referenceId: "22222222-2222-4222-8222-222222222222", quantity: 1 }],
    expectedVersion: 0,
  };
  const message = (body: unknown) => {
    const result = findingBody.safeParse(body);
    return result.success ? null : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  };

  it("accepts a finding and a finding the customer did not mention", () => {
    expect(message(valid)).toBeNull();
    expect(message({ ...valid, complaintId: null })).toBeNull();
  });

  it.each([
    [{ items: [{ kind: "PART", referenceId: valid.items[0].referenceId, quantity: 0 }] }, "items.0.quantity: Enter a quantity above 0"],
    [{ items: [{ kind: "PART", referenceId: valid.items[0].referenceId, quantity: 1.234 }] }, "items.0.quantity: Use at most 2 decimal places for the quantity"],
    [{ items: [{ kind: "PART", referenceId: "x", quantity: 1 }] }, "items.0.referenceId: Choose the work or part from the list"],
    [{ causeAndDefect: "x".repeat(2001) }, 'causeAndDefect: Keep "What did you find?" under 2000 characters'],
    [
      { items: [valid.items[0], { ...valid.items[0], quantity: 2 }] },
      "items.1.referenceId: This work or part is already listed. Change its quantity instead.",
    ],
  ])("refuses %j", (change, expected) => {
    expect(message({ ...valid, ...change })).toEqual([expected]);
  });

  it("allows the same reference as work and as a part, which are different lists", () => {
    const id = valid.items[0].referenceId;
    expect(message({ ...valid, items: [{ kind: "LABOUR", referenceId: id, quantity: 1 }, { kind: "PART", referenceId: id, quantity: 1 }] })).toBeNull();
  });

  it("keeps labour at one job whatever is sent", () => {
    expect(itemQuantity("LABOUR", 3)).toBe(1);
    expect(itemQuantity("OIL", 4.5)).toBe(4.5);
  });

  it("checks the allocation's note and ids", () => {
    expect(allocationBody.safeParse({ technicianId: "nope" }).success).toBe(false);
    const long = allocationBody.safeParse({ technicianId: valid.complaintId, note: "x".repeat(501) });
    expect(long.success ? null : long.error.issues[0].message).toBe("Keep the note to the technician under 500 characters");
  });
});
