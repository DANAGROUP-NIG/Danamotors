import { IndentStatus } from "@prisma/client";
import { BadRequestError, ConflictError } from "../../shared/errors/appError";
import {
  assertTransition,
  buildProgress,
  deriveIndentStatus,
  formatDocumentNumber,
  isSameFamily,
  pendingSupply,
  planCases,
  planPick,
  planReceipt,
  resolveDispatchQuantities,
  TransitLine,
  checkStnLineEdit,
  resizeCaseLines,
  stnLineVat,
} from "./stockTransfer.logic";

describe("formatDocumentNumber", () => {
  it("uses the legacy YYYY + 6-digit format", () => {
    expect(formatDocumentNumber(2026, 132)).toBe("2026000132");
    expect(formatDocumentNumber(2026, 1)).toBe("2026000001");
  });

  it("rejects sequences outside the six-digit range", () => {
    expect(() => formatDocumentNumber(2026, 0)).toThrow();
    expect(() => formatDocumentNumber(2026, 1_000_000)).toThrow();
  });
});

describe("assertTransition", () => {
  it("allows the documented transitions", () => {
    expect(() => assertTransition(IndentStatus.DRAFT, "submit")).not.toThrow();
    expect(() => assertTransition(IndentStatus.SUBMITTED, "approve")).not.toThrow();
    expect(() => assertTransition(IndentStatus.PICKED, "dispatch")).not.toThrow();
  });

  it("picks the back order again after a partial dispatch", () => {
    expect(() => assertTransition(IndentStatus.PARTLY_DISPATCHED, "pick")).not.toThrow();
    expect(() => assertTransition(IndentStatus.PARTLY_DISPATCHED, "close")).not.toThrow();
    expect(() => assertTransition(IndentStatus.IN_TRANSIT, "pick")).toThrow(ConflictError);
    expect(() => assertTransition(IndentStatus.COMPLETED, "close")).toThrow(ConflictError);
  });

  it("blocks duplicate or out-of-order actions", () => {
    expect(() => assertTransition(IndentStatus.IN_TRANSIT, "dispatch")).toThrow(ConflictError);
    expect(() => assertTransition(IndentStatus.PICKED, "pick")).toThrow(ConflictError);
    expect(() => assertTransition(IndentStatus.SUBMITTED, "dispatch")).toThrow(ConflictError);
    expect(() => assertTransition(IndentStatus.APPROVED, "reject")).toThrow(ConflictError);
  });

  it("does not allow cancelling after dispatch", () => {
    expect(() => assertTransition(IndentStatus.PICKED, "cancel")).not.toThrow();
    expect(() => assertTransition(IndentStatus.IN_TRANSIT, "cancel")).toThrow(ConflictError);
  });
});

describe("deriveIndentStatus", () => {
  const line = (approved: number, dispatched: number, accounted = 0) => ({
    approvedQuantity: approved,
    dispatchedQuantity: dispatched,
    accountedQuantity: accounted,
  });

  it("is PICKED while a picking list is open, whatever has shipped", () => {
    expect(deriveIndentStatus([line(5, 2)], true)).toBe(IndentStatus.PICKED);
  });

  it("stays APPROVED until something ships", () => {
    expect(deriveIndentStatus([line(5, 0)], false)).toBe(IndentStatus.APPROVED);
  });

  it("is PARTLY_DISPATCHED while part of the approved quantity is still to ship", () => {
    expect(deriveIndentStatus([line(5, 2, 2), line(3, 3)], false)).toBe(IndentStatus.PARTLY_DISPATCHED);
  });

  it("moves from IN_TRANSIT to COMPLETED as fully shipped STNs are received", () => {
    expect(deriveIndentStatus([line(5, 5)], false)).toBe(IndentStatus.IN_TRANSIT);
    expect(deriveIndentStatus([line(5, 5, 3)], false)).toBe(IndentStatus.PARTIALLY_RECEIVED);
    expect(deriveIndentStatus([line(5, 5, 5), line(0, 0)], false)).toBe(IndentStatus.COMPLETED);
  });
});

describe("pendingSupply", () => {
  const line = { requestedQuantity: 10, approvedQuantity: null as number | null, dispatchedQuantity: 0, cancelledQuantity: 0 };

  it("is the request less anything cancelled before approval", () => {
    expect(pendingSupply(line)).toBe(10);
    expect(pendingSupply({ ...line, cancelledQuantity: 4 })).toBe(6);
  });

  it("is the approved quantity less what has shipped after approval", () => {
    expect(pendingSupply({ ...line, approvedQuantity: 8, dispatchedQuantity: 3 })).toBe(5);
    expect(pendingSupply({ ...line, approvedQuantity: 3, dispatchedQuantity: 3, cancelledQuantity: 7 })).toBe(0);
  });

  it("never goes below zero", () => {
    expect(pendingSupply({ ...line, approvedQuantity: 0 })).toBe(0);
  });
});

describe("isSameFamily", () => {
  const main = { id: "main", mainPartId: null };
  const altA = { id: "altA", mainPartId: "main" };
  const altB = { id: "altB", mainPartId: "main" };
  const other = { id: "other", mainPartId: null };

  it("accepts the part itself, its alternates, its main and siblings", () => {
    expect(isSameFamily(main, main)).toBe(true);
    expect(isSameFamily(main, altA)).toBe(true);
    expect(isSameFamily(altA, main)).toBe(true);
    expect(isSameFamily(altA, altB)).toBe(true);
  });

  it("rejects unrelated parts", () => {
    expect(isSameFamily(main, other)).toBe(false);
    expect(isSameFamily(altA, other)).toBe(false);
  });
});

describe("planPick", () => {
  it("picks everything when stock covers the request", () => {
    expect(planPick(5, 52)).toEqual({ pickedQuantity: 5, backOrderQuantity: 0 });
  });

  it("picks only what is available and back-orders the rest", () => {
    expect(planPick(5, 3)).toEqual({ pickedQuantity: 3, backOrderQuantity: 2 });
  });

  it("back-orders everything when there is no stock", () => {
    expect(planPick(5, 0)).toEqual({ pickedQuantity: 0, backOrderQuantity: 5 });
    expect(planPick(5, -2)).toEqual({ pickedQuantity: 0, backOrderQuantity: 5 });
  });
});

describe("resolveDispatchQuantities", () => {
  const picked = [
    { id: "p1", pickedQuantity: 5 },
    { id: "p2", pickedQuantity: 3 },
  ];

  it("dispatches the full picked quantity by default", () => {
    const result = resolveDispatchQuantities(picked);
    expect(result.get("p1")).toBe(5);
    expect(result.get("p2")).toBe(3);
  });

  it("lets a line ship less than picked", () => {
    const result = resolveDispatchQuantities(picked, [{ pickingLineId: "p1", quantity: 2 }]);
    expect(result.get("p1")).toBe(2);
    expect(result.get("p2")).toBe(3);
  });

  it("refuses to ship more than picked", () => {
    expect(() => resolveDispatchQuantities(picked, [{ pickingLineId: "p1", quantity: 6 }])).toThrow(
      BadRequestError,
    );
  });

  it("refuses unknown lines and an empty shipment", () => {
    expect(() => resolveDispatchQuantities(picked, [{ pickingLineId: "zz", quantity: 1 }])).toThrow(
      BadRequestError,
    );
    expect(() =>
      resolveDispatchQuantities(picked, [
        { pickingLineId: "p1", quantity: 0 },
        { pickingLineId: "p2", quantity: 0 },
      ]),
    ).toThrow(BadRequestError);
  });
});

describe("planCases", () => {
  const dispatched = new Map([
    ["p1", 5],
    ["p2", 3],
    ["p3", 0],
  ]);

  it("packs everything into one case by default", () => {
    const plans = planCases(dispatched, undefined, "RAMANANDA");
    expect(plans).toHaveLength(1);
    expect(plans[0].packerName).toBe("RAMANANDA");
    expect(plans[0].lines).toEqual([
      { pickingLineId: "p1", quantity: 5 },
      { pickingLineId: "p2", quantity: 3 },
    ]);
  });

  it("splits one part across several cases and mixes parts in a case", () => {
    const plans = planCases(dispatched, [
      { lines: [{ pickingLineId: "p1", quantity: 3 }, { pickingLineId: "p2", quantity: 3 }] },
      { lines: [{ pickingLineId: "p1", quantity: 2 }] },
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0].lines).toHaveLength(2);
  });

  it("requires the cases to hold exactly the dispatched quantity", () => {
    expect(() => planCases(dispatched, [{ lines: [{ pickingLineId: "p1", quantity: 5 }] }])).toThrow(
      /dispatches 3 but the cases hold 0/,
    );
    expect(() =>
      planCases(dispatched, [
        { lines: [{ pickingLineId: "p1", quantity: 6 }, { pickingLineId: "p2", quantity: 3 }] },
      ]),
    ).toThrow(BadRequestError);
  });

  it("rejects lines that are not shipping", () => {
    expect(() =>
      planCases(dispatched, [
        {
          lines: [
            { pickingLineId: "p1", quantity: 5 },
            { pickingLineId: "p2", quantity: 3 },
            { pickingLineId: "p3", quantity: 1 },
          ],
        },
      ]),
    ).toThrow(/not being dispatched/);
  });
});

describe("planReceipt", () => {
  const fresh = (): TransitLine[] => [
    { id: "m1", quantity: 5, receivedQuantity: 0, damagedQuantity: 0, shortQuantity: 0 },
    { id: "m2", quantity: 3, receivedQuantity: 0, damagedQuantity: 0, shortQuantity: 0 },
  ];

  it("receives everything in good condition when no lines are given", () => {
    const plan = planReceipt(fresh());
    expect(plan.fullyAccounted).toBe(true);
    expect(plan.totals).toEqual({ received: 8, damaged: 0, short: 0 });
  });

  it("supports a partial receipt that stays open", () => {
    const plan = planReceipt(fresh(), [{ lineId: "m1", receivedQuantity: 2 }]);
    expect(plan.fullyAccounted).toBe(false);
    expect(plan.lines).toEqual([
      { lineId: "m1", receivedQuantity: 2, damagedQuantity: 0, shortQuantity: 0, remarks: undefined },
    ]);
  });

  it("records damaged quantities separately from good stock", () => {
    const plan = planReceipt(fresh(), [
      { lineId: "m1", receivedQuantity: 4, damagedQuantity: 1 },
      { lineId: "m2", receivedQuantity: 3 },
    ]);
    expect(plan.fullyAccounted).toBe(true);
    expect(plan.totals).toEqual({ received: 7, damaged: 1, short: 0 });
  });

  it("closes a transfer with missing items as short", () => {
    const plan = planReceipt(fresh(), [{ lineId: "m1", receivedQuantity: 4 }], true);
    expect(plan.fullyAccounted).toBe(true);
    expect(plan.totals).toEqual({ received: 4, damaged: 0, short: 4 });
    expect(plan.lines.find((l) => l.lineId === "m2")?.shortQuantity).toBe(3);
  });

  it("only allows what is still outstanding", () => {
    const lines = fresh();
    lines[0].receivedQuantity = 4;
    expect(() => planReceipt(lines, [{ lineId: "m1", receivedQuantity: 2 }])).toThrow(BadRequestError);
    const second = planReceipt(lines);
    expect(second.lines.find((l) => l.lineId === "m1")?.receivedQuantity).toBe(1);
  });

  it("refuses to post a receipt when nothing is outstanding", () => {
    const done: TransitLine[] = [
      { id: "m1", quantity: 5, receivedQuantity: 5, damagedQuantity: 0, shortQuantity: 0 },
    ];
    expect(() => planReceipt(done)).toThrow(/Nothing to receive/);
  });
});

describe("buildProgress", () => {
  it("marks each stage with the first time it was reached", () => {
    const at = new Date("2026-09-24T10:00:00Z");
    const actor = { id: "u1", firstName: "Ada", lastName: "Obi" };
    const progress = buildProgress([
      { toStatus: IndentStatus.DRAFT, createdAt: at, remarks: null, actor },
      { toStatus: IndentStatus.SUBMITTED, createdAt: at, remarks: null, actor },
      { toStatus: IndentStatus.APPROVED, createdAt: at, remarks: "ok", actor },
    ]);
    expect(progress.find((p) => p.key === "SUBMITTED")?.completed).toBe(true);
    expect(progress.find((p) => p.key === "APPROVED")?.remarks).toBe("ok");
    expect(progress.find((p) => p.key === "PICKED")?.completed).toBe(false);
  });
});

describe("stnLineVat", () => {
  it("charges 7.5% on taxable parts under forms L and Z, as legacy did", () => {
    // ABJ STN 2025000027 (form L): 583022KA10 x 1 at 78,477.11 carried 5,885.78 VAT.
    expect(stnLineVat("L", true, 78477.11, 7.5)).toEqual({ vatPercent: 7.5, taxAmount: 5885.78 });
    // CPD STN 2023000616 (form Z): 423,470.13 of parts carried 31,760.26.
    expect(stnLineVat("Z", true, 423470.13, 7.5).taxAmount).toBe(31760.26);
  });

  it("charges nothing under X, Y and P, on non-taxable parts, or with no form", () => {
    for (const form of ["X", "Y", "P", null, undefined]) expect(stnLineVat(form, true, 1000, 7.5)).toEqual({ vatPercent: 0, taxAmount: 0 });
    expect(stnLineVat("L", false, 1000, 7.5)).toEqual({ vatPercent: 0, taxAmount: 0 });
  });
});

describe("resizeCaseLines", () => {
  const lines = [
    { id: "a", caseId: "c1", quantity: 3 },
    { id: "b", caseId: "c2", quantity: 2 },
  ];

  it("adds extra units to the first case", () => {
    expect(resizeCaseLines(lines, 7).map((l) => l.quantity)).toEqual([5, 2]);
  });

  it("takes units out of the last case first, emptying it if needed", () => {
    expect(resizeCaseLines(lines, 4).map((l) => l.quantity)).toEqual([3, 1]);
    expect(resizeCaseLines(lines, 2).map((l) => l.quantity)).toEqual([2, 0]);
    expect(resizeCaseLines(lines, 0).map((l) => l.quantity)).toEqual([0, 0]);
  });

  it("refuses a negative quantity or an unpacked line", () => {
    expect(() => resizeCaseLines(lines, -1)).toThrow(BadRequestError);
    expect(() => resizeCaseLines([], 1)).toThrow(BadRequestError);
  });
});

describe("checkStnLineEdit", () => {
  const line = { partNumber: "P1", quantity: 5, accounted: 0 };

  it("returns the change in quantity", () => {
    expect(checkStnLineEdit(line, 3, 0)).toBe(-2);
    expect(checkStnLineEdit(line, 8, 3)).toBe(3);
    // A direct STN has no back order; free stock is checked when the stock row is locked.
    expect(checkStnLineEdit(line, 20, null)).toBe(15);
  });

  it("limits an increase to the indent's back order", () => {
    expect(() => checkStnLineEdit(line, 9, 3)).toThrow(/at most/);
  });

  it("refuses a line already received or a bad quantity", () => {
    expect(() => checkStnLineEdit({ ...line, accounted: 1 }, 4, 0)).toThrow(ConflictError);
    expect(() => checkStnLineEdit(line, 1.5, 0)).toThrow(BadRequestError);
  });
});
