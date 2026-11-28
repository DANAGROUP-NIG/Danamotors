import {
  AUTHORISATION_STATEMENT,
  DELIVERY_STATEMENT,
  addressLine,
  numberedTerms,
  printChecklist,
  printFindings,
  signatureBoxes,
  technicianSignOff,
  textLines,
  type SignatureFacts,
} from "./job-print.logic";

const at = (iso: string) => new Date(iso);

describe("printChecklist", () => {
  it("lists the 25 paper-card items in order with the recorded state", () => {
    const rows = printChecklist({ SERVICE_BOOK: "PRESENT", HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING" });
    expect(rows).toHaveLength(25);
    expect(rows[0]).toEqual({ number: 1, code: "SERVICE_BOOK", label: "Service book", state: "PRESENT" });
    expect(rows.find((row) => row.code === "HUB_CAPS")?.state).toBe("MISSING");
    expect(rows.find((row) => row.code === "AC_WORKING")?.state).toBe("NOT_WORKING");
    expect(rows[24]).toMatchObject({ number: 25, label: "Fire extinguisher", state: null });
  });

  it("ignores unknown codes and values and treats a missing record as unchecked", () => {
    expect(printChecklist({ SERVICE_BOOK: "BROKEN", NOT_AN_ITEM: "PRESENT" }).every((row) => row.state === null)).toBe(true);
    expect(printChecklist(null).every((row) => row.state === null)).toBe(true);
  });
});

describe("textLines", () => {
  it("splits on new lines and drops blanks", () => {
    expect(textLines("Check brakes.\r\n\n  Replace wiper  \n")).toEqual(["Check brakes.", "Replace wiper"]);
    expect(textLines(null)).toEqual([]);
  });
});

describe("printFindings", () => {
  it("orders by request, then findings the customer did not mention, then those from the repair", () => {
    const rows = printFindings([
      { causeAndDefect: "Wiper torn.", raisedDuringRepair: true, requestIndex: null, createdAt: at("2026-11-26T10:00:00Z") },
      { causeAndDefect: "Pads worn.", raisedDuringRepair: false, requestIndex: 1, createdAt: at("2026-11-25T10:00:00Z") },
      { causeAndDefect: "Tyre bulge.", raisedDuringRepair: false, requestIndex: null, createdAt: at("2026-11-25T11:00:00Z") },
      { causeAndDefect: "Due for service.", raisedDuringRepair: false, requestIndex: 0, createdAt: at("2026-11-25T12:00:00Z") },
      { causeAndDefect: "   ", raisedDuringRepair: false, requestIndex: 2, createdAt: at("2026-11-25T12:00:00Z") },
    ]);
    expect(rows).toEqual([
      { text: "Due for service.", source: "Request 1" },
      { text: "Pads worn.", source: "Request 2" },
      { text: "Tyre bulge.", source: "Also found" },
      { text: "Wiper torn.", source: "Found during the repair" },
    ]);
  });
});

describe("numberedTerms", () => {
  it("drops blank clauses and numbers the rest from 1", () => {
    expect(numberedTerms(["  Authorisation. ", "", "Storage."])).toEqual([
      { number: 1, text: "Authorisation." },
      { number: 2, text: "Storage." },
    ]);
  });
});

describe("technicianSignOff", () => {
  it("uses the latest send to quality check, else the assigned technician without a date", () => {
    const events = [
      { action: "SEND_TO_QC", actorName: "Musa Abdullahi", at: at("2026-11-26T09:00:00Z") },
      { action: "RETURN_TO_REPAIR", actorName: "Tunde Bakare", at: at("2026-11-26T10:00:00Z") },
      { action: "SEND_TO_QC", actorName: "Musa Abdullahi", at: at("2026-11-26T12:00:00Z") },
    ];
    expect(technicianSignOff(events, "Someone Else")).toEqual({ name: "Musa Abdullahi", at: at("2026-11-26T12:00:00Z") });
    expect(technicianSignOff([], "Musa Abdullahi")).toEqual({ name: "Musa Abdullahi", at: null });
    expect(technicianSignOff([], null)).toEqual({ name: null, at: null });
  });
});

describe("addressLine", () => {
  it("joins the non-empty parts once each", () => {
    expect(addressLine(["14 Admiralty Way", null, " ", "Lekki", "Lagos", "lagos"])).toBe("14 Admiralty Way, Lekki, Lagos");
    expect(addressLine([null, ""])).toBeNull();
  });
});

describe("signatureBoxes", () => {
  const full: SignatureFacts = {
    advisor: { name: "Chidi Eze", at: at("2026-11-25T08:40:00Z") },
    technician: { name: "Musa Abdullahi", at: at("2026-11-26T12:00:00Z") },
    certifier: { name: "Tunde Bakare", at: at("2026-11-27T09:00:00Z"), image: "data:image/png;base64,QC" },
    authorisation: { name: "Kunle Adeyemi", relationship: "Brother", at: at("2026-11-25T08:35:00Z"), image: "data:image/png;base64,AU", state: "signed" },
    delivery: { name: "Adaeze Okafor", relationship: null, at: at("2026-11-28T14:20:00Z"), image: "data:image/png;base64,DE" },
  };

  it("prints the five paper-card boxes in order with names, dates and captured signatures", () => {
    const boxes = signatureBoxes(full);
    expect(boxes.map((box) => box.title)).toEqual(["Service advisor", "Technician", "Service manager", "Customer authorisation", "Customer delivery"]);
    expect(boxes[0]).toMatchObject({ name: "Chidi Eze", image: null, statement: null });
    expect(boxes[2]).toMatchObject({ name: "Tunde Bakare", image: "data:image/png;base64,QC" });
    expect(boxes[3]).toMatchObject({ statement: AUTHORISATION_STATEMENT, capacity: "Representative, Brother", image: "data:image/png;base64,AU", note: null });
    expect(boxes[4]).toMatchObject({ statement: DELIVERY_STATEMENT, name: "Adaeze Okafor", capacity: null, image: "data:image/png;base64,DE" });
  });

  it("leaves blank lines where nothing was captured", () => {
    const boxes = signatureBoxes({ advisor: { name: null, at: null }, technician: { name: "  ", at: null }, certifier: null, authorisation: null, delivery: null });
    for (const box of boxes) expect(box).toMatchObject({ name: null, date: null, image: null, note: null });
  });

  it("notes a check-in signature that no longer matches, and never prints one that cannot be verified", () => {
    const stale = signatureBoxes({ ...full, authorisation: { ...full.authorisation!, state: "stale" } })[3];
    expect(stale).toMatchObject({ image: "data:image/png;base64,AU", note: "Details changed after the customer signed." });
    const invalid = signatureBoxes({ ...full, authorisation: { ...full.authorisation!, state: "invalid" } })[3];
    expect(invalid.image).toBeNull();
    expect(invalid.note).toBe("The signature could not be verified. Ask the customer to sign the printed copy.");
  });
});
