import {
  BOARD_COLUMNS,
  boardColumn,
  boardFilter,
  boardQuery,
  columnTargets,
  foldBoardCounts,
  groupBoardCards,
  lagosDayRange,
} from "./job-board.logic";

describe("boardColumn", () => {
  it("puts each active step in its column, waiting parts in its own lane and billing with delivery as Ready", () => {
    expect(boardColumn("CHECK_IN", "OPEN")).toBe("CHECK_IN");
    expect(boardColumn("DIAGNOSIS", "OPEN")).toBe("DIAGNOSIS");
    expect(boardColumn("WARRANTY", "OPEN")).toBe("WARRANTY");
    expect(boardColumn("ESTIMATE", "OPEN")).toBe("AWAITING_APPROVAL");
    expect(boardColumn("REPAIR", "IN_PROGRESS")).toBe("IN_REPAIR");
    expect(boardColumn("REPAIR", "WAITING_PARTS")).toBe("WAITING_PARTS");
    expect(boardColumn("QUALITY_CHECK", "QC")).toBe("QUALITY_CHECK");
    expect(boardColumn("BILLING", "QC")).toBe("READY");
    expect(boardColumn("BILLING", "BILLED")).toBe("READY");
    expect(boardColumn("DELIVERY", "BILLED")).toBe("READY");
  });

  it("leaves closed and cancelled jobs off the board", () => {
    expect(boardColumn("CLOSED", "DELIVERED")).toBeNull();
    expect(boardColumn("CANCELLED", "CANCELLED")).toBeNull();
  });
});

describe("foldBoardCounts", () => {
  it("adds the grouped counts into column totals and the five figures", () => {
    const { totals, summary } = foldBoardCounts([
      { stage: "CHECK_IN", status: "OPEN", total: 2, overdue: 1 },
      { stage: "DIAGNOSIS", status: "OPEN", total: 3, overdue: 0 },
      { stage: "ESTIMATE", status: "OPEN", total: 4, overdue: 1 },
      { stage: "REPAIR", status: "IN_PROGRESS", total: 4, overdue: 0 },
      { stage: "REPAIR", status: "WAITING_PARTS", total: 3, overdue: 2 },
      { stage: "QUALITY_CHECK", status: "QC", total: 2, overdue: 0 },
      { stage: "BILLING", status: "READY", total: 3, overdue: 3 },
      { stage: "DELIVERY", status: "BILLED", total: 2, overdue: 1 },
      { stage: "CLOSED", status: "DELIVERED", total: 40, overdue: 40 },
    ]);
    expect(totals).toEqual({
      CHECK_IN: 2,
      DIAGNOSIS: 3,
      WARRANTY: 0,
      AWAITING_APPROVAL: 4,
      IN_REPAIR: 4,
      WAITING_PARTS: 3,
      QUALITY_CHECK: 2,
      READY: 5,
    });
    // In workshop: diagnosis to quality check (3 + 0 + 4 + 4 + 3 + 2); overdue leaves out Ready.
    expect(summary).toEqual({ inWorkshop: 16, awaitingApproval: 4, waitingParts: 3, readyForCollection: 5, overdue: 4 });
  });

  it("gives zeros for an empty branch", () => {
    const { totals, summary } = foldBoardCounts([]);
    expect(Object.values(totals).every((value) => value === 0)).toBe(true);
    expect(summary).toEqual({ inWorkshop: 0, awaitingApproval: 0, waitingParts: 0, readyForCollection: 0, overdue: 0 });
  });
});

describe("groupBoardCards", () => {
  const card = (id: string, stage: "REPAIR" | "BILLING" | "DELIVERY" | "CLOSED", status: string, minute: number) => ({
    id,
    stage,
    status,
    enteredAt: new Date(Date.UTC(2026, 10, 27, 8, minute)),
  });

  it("orders each column by the longest in the step first and merges billing and delivery into Ready", () => {
    const columns = groupBoardCards([
      card("b", "REPAIR", "IN_PROGRESS", 30),
      card("a", "REPAIR", "IN_PROGRESS", 10),
      card("w", "REPAIR", "WAITING_PARTS", 5),
      card("d", "DELIVERY", "BILLED", 40),
      card("c", "BILLING", "READY", 20),
      card("x", "CLOSED", "DELIVERED", 1),
    ]);
    expect(columns.IN_REPAIR.map((item) => item.id)).toEqual(["a", "b"]);
    expect(columns.WAITING_PARTS.map((item) => item.id)).toEqual(["w"]);
    expect(columns.READY.map((item) => item.id)).toEqual(["c", "d"]);
    expect(Object.keys(columns)).toEqual([...BOARD_COLUMNS]);
    expect(Object.values(columns).flat().some((item) => item.id === "x")).toBe(false);
  });

  it("keeps at most the cap per column", () => {
    const many = Array.from({ length: 60 }, (_, index) => card(`r${String(index).padStart(2, "0")}`, "BILLING", "READY", index % 59));
    expect(groupBoardCards(many, 50).READY).toHaveLength(50);
  });
});

describe("columnTargets", () => {
  it("maps the branch settings onto the columns, with no target for repair, waiting parts and ready", () => {
    expect(
      columnTargets({
        stageTargetCheckInMinutes: 30,
        stageTargetDiagnosisMinutes: 120,
        stageTargetWarrantyMinutes: 90,
        stageTargetEstimateMinutes: 100,
        stageTargetQualityCheckMinutes: 60,
      }),
    ).toEqual({
      CHECK_IN: 30,
      DIAGNOSIS: 120,
      WARRANTY: 90,
      AWAITING_APPROVAL: 100,
      IN_REPAIR: null,
      WAITING_PARTS: null,
      QUALITY_CHECK: 60,
      READY: null,
    });
  });
});

describe("board query and filter", () => {
  const branch = "6f1c2d4e-1111-4a2b-9c3d-000000000001";
  const advisor = "6f1c2d4e-1111-4a2b-9c3d-000000000002";

  it("takes the received day in Lagos time", () => {
    const range = lagosDayRange("2026-11-27");
    expect(range.gte.toISOString()).toBe("2026-11-26T23:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-11-27T23:00:00.000Z");
  });

  it("builds the filter with only the values given", () => {
    expect(boardFilter({ advisorId: advisor }, branch)).toEqual({ branchId: branch, advisorId: advisor });
    expect(boardFilter({ date: "2026-11-27" }, branch).received?.gte.toISOString()).toBe("2026-11-26T23:00:00.000Z");
  });

  it("names the field in each validation message", () => {
    const bad = boardQuery.safeParse({ advisorId: "musa", technicianId: "x", date: "27/11/2026" });
    expect(bad.success).toBe(false);
    const messages = bad.success ? [] : bad.error.issues.map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Choose a service advisor from the list",
        "Choose a technician from the list",
        "Enter the received date as YYYY-MM-DD",
      ]),
    );
    expect(boardQuery.safeParse({ date: "2026-13-45" }).success).toBe(false);
    expect(boardQuery.safeParse({ status: "OPEN" }).success).toBe(false);
  });
});
