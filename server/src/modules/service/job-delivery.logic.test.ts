import { followUpDueAt } from "../psf/psf.logic";
import { reasonProblem } from "../late-delivery/late-delivery.logic";
import {
  BELONGINGS_NOTE,
  belongingsList,
  collectorFor,
  collectorProblem,
  deliveryBody,
  deliveryDocument,
  deliveryEvidenceHash,
  deliveryProblems,
  isLate,
  releaseApprovalBody,
  representativeSigner,
  RELEASE_RULE,
  unreturnedBelongings,
  validDeliveryEvidence,
  workDoneLines,
  type DeliveryFacts,
} from "./job-delivery.logic";
import { openingHash } from "./job-opening-signature.logic";

const owner = { name: "Adaeze Okafor", phone: "08035550142" };
const rep = { name: "Emeka Obi", phone: "08031112222" };
const uuid = "11111111-1111-4111-8111-111111111111";

describe("belongingsList", () => {
  it("lists returnable items that were present at check-in, in paper order, then the belongings note", () => {
    const list = belongingsList(
      { TOOL_KIT: "PRESENT", SERVICE_BOOK: "PRESENT", SPARE_WHEEL: "PRESENT", JACK_AND_HANDLE: "MISSING", HEADLAMPS: "PRESENT", STEREO: "PRESENT" },
      "  Umbrella in boot ",
    );
    expect(list).toEqual([
      { code: "SERVICE_BOOK", label: "Service book" },
      { code: "TOOL_KIT", label: "Tool kit" },
      { code: "SPARE_WHEEL", label: "Spare wheel" },
      { code: BELONGINGS_NOTE, label: "Umbrella in boot" },
    ]);
  });

  it("leaves out fixtures, missing items, a blank note and unreadable checklist data", () => {
    expect(belongingsList({ HEADLAMPS: "PRESENT", TOOL_KIT: "NOT_WORKING" }, "   ")).toEqual([]);
    expect(belongingsList("not json", null)).toEqual([]);
    expect(belongingsList({ TOOL_KIT: "PRESENT", BOGUS: "PRESENT" }, undefined)).toEqual([{ code: "TOOL_KIT", label: "Tool kit" }]);
  });

  it("finds the belongings not ticked as returned", () => {
    const list = belongingsList({ SERVICE_BOOK: "PRESENT", TOOL_KIT: "PRESENT" }, "Umbrella");
    expect(unreturnedBelongings(list, ["TOOL_KIT"]).map((item) => item.code)).toEqual(["SERVICE_BOOK", BELONGINGS_NOTE]);
    expect(unreturnedBelongings(list, ["SERVICE_BOOK", "TOOL_KIT", BELONGINGS_NOTE])).toEqual([]);
  });
});

describe("collector check", () => {
  it("treats the check-in signer as a separate collector only when it was not the owner", () => {
    expect(representativeSigner({ name: " adaeze  OKAFOR", phone: null }, owner.name)).toBeNull();
    expect(representativeSigner(rep, owner.name)).toEqual(rep);
    expect(representativeSigner(null, owner.name)).toBeNull();
  });

  it("releases to the owner or the check-in signer without an override", () => {
    const facts = { owner, checkInSigner: rep, approval: null };
    expect(collectorProblem("OWNER", facts)).toBeNull();
    expect(collectorProblem("CHECK_IN_SIGNER", facts)).toBeNull();
    expect(collectorFor("CHECK_IN_SIGNER", facts)).toEqual(rep);
    expect(collectorFor("OWNER", facts)).toEqual(owner);
  });

  it("needs a choice, a real check-in signer, and a manager's approval for someone else", () => {
    const facts = { owner, checkInSigner: null, approval: null };
    expect(collectorProblem(null, facts)).toBe("Choose who is collecting the vehicle.");
    expect(collectorProblem("CHECK_IN_SIGNER", facts)).toMatch(/Nobody else signed the job card/);
    expect(collectorProblem("OTHER", facts)).toBe(RELEASE_RULE);
    expect(RELEASE_RULE).toMatch(/Terms clause 7/);
    const approved = { ...facts, approval: { name: "Bola Ade", phone: "08029998888" } };
    expect(collectorProblem("OTHER", approved)).toBeNull();
    expect(collectorFor("OTHER", approved)).toEqual({ name: "Bola Ade", phone: "08029998888" });
  });
});

describe("deliveryProblems", () => {
  const ready: DeliveryFacts = {
    paymentProblem: null,
    phoneSignaturesDue: 0,
    belongings: [{ code: "TOOL_KIT", label: "Tool kit" }],
    returned: ["TOOL_KIT"],
    collectorProblem: null,
    late: false,
    lateReasonCount: 0,
    lateReasonProblem: null,
    signed: true,
  };

  it("is empty when everything is done", () => {
    expect(deliveryProblems(ready)).toEqual([]);
  });

  it("lists every problem in screen order", () => {
    expect(
      deliveryProblems({
        paymentProblem: "Balance of ₦48,350.00 not yet paid.",
        phoneSignaturesDue: 1,
        belongings: [{ code: "A", label: "A" }, { code: "B", label: "B" }],
        returned: [],
        collectorProblem: "Choose who is collecting the vehicle.",
        late: true,
        lateReasonCount: 0,
        lateReasonProblem: "Select at least one reason.",
        signed: false,
      }),
    ).toEqual([
      "Balance of ₦48,350.00 not yet paid.",
      "The customer must first sign the estimate they approved on the phone.",
      "Tick Returned for every belonging: 2 are not ticked yet.",
      "Choose who is collecting the vehicle.",
      "The promised time has passed. Choose 1 to 6 reasons for late delivery.",
      "The customer must sign to take delivery.",
    ]);
  });

  it("names the problem with the chosen reasons", () => {
    expect(deliveryProblems({ ...ready, late: true, lateReasonCount: 2, lateReasonProblem: "A reason can be selected only once." })).toEqual([
      "Reasons for late delivery: A reason can be selected only once.",
    ]);
  });

  it("uses the singular for one belonging and ignores the reasons when on time", () => {
    expect(deliveryProblems({ ...ready, returned: [], lateReasonProblem: "Select at least one reason." })).toEqual([
      "Tick Returned for every belonging: 1 is not ticked yet.",
    ]);
  });
});

describe("late delivery gate (existing rules)", () => {
  const promised = new Date("2026-11-28T15:00:00Z");
  it("is late only after the promised time", () => {
    expect(isLate(promised, new Date("2026-11-28T15:00:00Z"))).toBe(false);
    expect(isLate(promised, new Date("2026-11-28T15:00:01Z"))).toBe(true);
    expect(isLate(null, new Date())).toBe(false);
  });

  it("needs 1 to 6 distinct active reasons", () => {
    const options = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `r${n}`, active: n !== 7 }));
    expect(reasonProblem([], options, [])).toBe("Select at least one reason.");
    expect(reasonProblem(["r1", "r1"], options, [])).toBe("A reason can be selected only once.");
    expect(reasonProblem(["r1", "r2", "r3", "r4", "r5", "r6", "r7"], options, [])).toBe("At most 6 reasons are allowed.");
    expect(reasonProblem(["r7"], options, [])).toBe("One of the selected reasons is no longer in use.");
    expect(reasonProblem(["r1", "r6"], options, [])).toBeNull();
  });
});

describe("workDoneLines", () => {
  it("says which work was added with approval or is not charged", () => {
    expect(
      workDoneLines(
        [
          { description: "Periodic service (50,000 km)", supplementary: false, payer: "CUSTOMER" },
          { description: "AC compressor replacement", supplementary: false, payer: "WARRANTY" },
          { description: "Rear wiper blade replacement", supplementary: true, payer: "CUSTOMER" },
        ],
        "ignored",
      ),
    ).toEqual([
      { text: "Periodic service (50,000 km)", note: null },
      { text: "AC compressor replacement", note: "Covered by warranty, no charge to you" },
      { text: "Rear wiper blade replacement", note: "Added with your approval" },
    ]);
  });

  it("falls back to the work done text on jobs without a work list", () => {
    expect(workDoneLines([], "Oil changed.\r\n\n  Brakes checked. ")).toEqual([
      { text: "Oil changed.", note: null },
      { text: "Brakes checked.", note: null },
    ]);
    expect(workDoneLines([], null)).toEqual([]);
  });
});

describe("delivery evidence", () => {
  const document = deliveryDocument({
    jobNumber: "2026000127",
    registration: "KJA 482 TX",
    workDone: [{ text: "Periodic service", note: null }],
    declined: ["Air filter"],
    belongings: [{ code: "TOOL_KIT", label: "Tool kit" }],
    collectorType: "OWNER",
    collector: owner,
    release: null,
  });
  const image = "data:image/png;base64,iVBORw0KGgo=";
  const evidence = {
    documentHash: openingHash(document),
    signerName: owner.name,
    signerPhone: owner.phone,
    capturedById: uuid,
    signedAt: new Date("2026-11-28T14:20:00Z"),
    signatureImage: image,
  };

  it("records every belonging as returned with the delivery statement", () => {
    expect(document.statement).toBe("I am taking delivery of the vehicle and I am satisfied with the repairs.");
    expect(document.belongings).toEqual([{ code: "TOOL_KIT", label: "Tool kit", returned: true }]);
    expect(document.collector).toEqual({ type: "OWNER", name: owner.name, phone: owner.phone });
  });

  it("verifies until the document, signer or image changes", () => {
    const stored = { ...evidence, snapshot: document, evidenceHash: deliveryEvidenceHash(evidence) };
    expect(validDeliveryEvidence(stored)).toBe(true);
    expect(validDeliveryEvidence({ ...stored, snapshot: { ...document, declined: [] } })).toBe(false);
    expect(validDeliveryEvidence({ ...stored, signerName: "Someone Else" })).toBe(false);
    expect(validDeliveryEvidence({ ...stored, signatureImage: `${image}A` })).toBe(false);
  });
});

describe("input rules", () => {
  it("names the field and the fix", () => {
    const result = deliveryBody.safeParse({ requestId: "x", collectorType: "NEIGHBOUR", returnedCodes: [], accepted: false, signatureImage: "" });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        "requestId: Reload the page and try again",
        "collectorType: Choose who is collecting the vehicle",
        "accepted: The customer must confirm the delivery statement",
        "signatureImage: Ask the customer to sign in the box",
      ]),
    );
  });

  it("normalises the collector's phone and needs a real reason", () => {
    const ok = releaseApprovalBody.parse({ requestId: uuid, collectorName: "Bola Ade", collectorPhone: "+234 803 999 8888", reason: "Owner called and sent her driver." });
    expect(ok.collectorPhone).toBe("08039998888");
    const short = releaseApprovalBody.safeParse({ requestId: uuid, collectorName: "B", collectorPhone: "123", reason: "ok" });
    expect(short.success ? [] : short.error.issues.map((issue) => issue.path[0])).toEqual(["collectorName", "collectorPhone", "reason"]);
  });
});

describe("followUpDueAt (PSF)", () => {
  it("is due 09:00 Lagos time, the given number of Lagos days after delivery", () => {
    // 28 Nov 2026, 15:20 Lagos.
    expect(followUpDueAt(new Date("2026-11-28T14:20:00Z"), 2).toISOString()).toBe("2026-11-30T08:00:00.000Z");
    // 23:30 UTC on 28 Nov is already 29 Nov in Lagos.
    expect(followUpDueAt(new Date("2026-11-28T23:30:00Z"), 2).toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(followUpDueAt(new Date("2026-11-28T14:20:00Z"), 0).toISOString()).toBe("2026-11-28T08:00:00.000Z");
  });
});
