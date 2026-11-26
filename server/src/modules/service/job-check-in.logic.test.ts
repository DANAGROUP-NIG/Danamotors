import { deflateSync } from "zlib";
import {
  CHECKLIST_ITEMS,
  checkInGates,
  checkInSnapshot,
  checkInStep,
  checklistSchema,
  damageMarkBody,
  decodePhoto,
  detailsBody,
  imageSize,
  mileageProblem,
  photoBody,
  PHOTO_MAX_BYTES,
  readChecklist,
  requestsChanged,
  uncheckedItems,
  walkAroundBody,
  type CheckInGateFacts,
  type Checklist,
} from "./job-check-in.logic";

const REQUEST = "11111111-1111-4111-8111-111111111111";
const allPresent = (): Checklist => Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.code, "PRESENT"])) as Checklist;
const now = new Date("2026-11-26T09:00:00Z");

function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(height * (1 + width * 3)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const jpeg = (width: number, height: number) =>
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString("base64")}`;

describe("checklist schema", () => {
  it("has the 25 paper card items with unique codes", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(25);
    expect(new Set(CHECKLIST_ITEMS.map((item) => item.code)).size).toBe(25);
  });

  it("accepts the three states keyed by item code, and a partial list", () => {
    expect(checklistSchema.parse({ HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING" })).toEqual({ HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING" });
    expect(checklistSchema.parse(allPresent())).toEqual(allPresent());
  });

  it("refuses unknown items and unknown states with a message that says what to do", () => {
    const unknown = checklistSchema.safeParse({ SUNROOF: "PRESENT" });
    expect(unknown.success).toBe(false);
    expect(unknown.error?.issues[0].message).toBe("The checklist has an item that is not on the job card. Reload the page and try again.");
    const state = checklistSchema.safeParse({ HUB_CAPS: "BROKEN" });
    expect(state.error?.issues[0].message).toBe("Choose Present, Missing or Not working for each checklist item");
  });

  it("reads stored JSON safely, keeping only known items and states", () => {
    expect(readChecklist(null)).toEqual({});
    expect(readChecklist({ HUB_CAPS: "MISSING", SUNROOF: "PRESENT", CLOCK: "BROKEN" })).toEqual({ HUB_CAPS: "MISSING" });
    expect(uncheckedItems({ HUB_CAPS: "MISSING" })).toHaveLength(24);
  });
});

describe("damage mark coordinates", () => {
  const mark = (x: unknown, y: unknown) => damageMarkBody.safeParse({ requestId: REQUEST, type: "DENT", x, y });

  it("accepts percentages from 0 to 100 and rounds to two decimals", () => {
    expect(mark(0, 100).success).toBe(true);
    expect(mark(12.345, 67.891).data).toMatchObject({ x: 12.35, y: 67.89, note: null, photoId: null });
  });

  it.each([
    [-0.01, 50],
    [100.01, 50],
    [50, -1],
    [50, 101],
  ])("refuses a mark off the diagram (%s, %s)", (x, y) => {
    const result = mark(x, y);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Place the mark on the car diagram");
  });

  it("refuses missing or non-numeric positions and unknown types", () => {
    expect(mark("12", 50).error?.issues[0].message).toBe("Tap the car diagram to place the mark (x position missing)");
    expect(mark(Infinity, 50).success).toBe(false);
    expect(damageMarkBody.safeParse({ requestId: REQUEST, type: "CHIP", x: 1, y: 1 }).error?.issues[0].message).toBe("Choose Crack, Dent or Scratch");
  });
});

describe("walk-around and details input", () => {
  const draft = { expectedVersion: 0, fuelLevel: "HALF", checklist: {}, serviceBookSeen: false, serviceBookStamps: 3, noValuables: true, belongingsNote: "  " };

  it("drops stamps when the service book was not seen and blanks empty notes", () => {
    expect(walkAroundBody.parse(draft)).toMatchObject({ serviceBookStamps: null, belongingsNote: null, checklistNote: null });
    expect(walkAroundBody.parse({ ...draft, serviceBookSeen: true }).serviceBookStamps).toBe(3);
  });

  it("limits stamps to a whole number from 0 to 12", () => {
    expect(walkAroundBody.safeParse({ ...draft, serviceBookSeen: true, serviceBookStamps: 13 }).error?.issues[0].message).toBe(
      "Enter 12 stamps or fewer for this warranty year",
    );
    expect(walkAroundBody.safeParse({ ...draft, serviceBookStamps: 1.5 }).success).toBe(false);
  });

  it("requires a request and a reason for an odometer replacement on Details", () => {
    const details = {
      customerId: REQUEST,
      mileage: 48250,
      serviceTypeId: REQUEST,
      promisedAt: "2026-11-28T15:00:00Z",
      complaints: [{ description: "AC not cooling well" }],
      instructionsToTechnician: null,
    };
    expect(detailsBody.safeParse(details).success).toBe(true);
    expect(detailsBody.safeParse({ ...details, complaints: [] }).error?.issues[0].message).toBe("Add at least one customer request");
    expect(detailsBody.safeParse({ ...details, mileage: undefined }).error?.issues[0].message).toBe("Enter the current mileage");
    const replaced = detailsBody.safeParse({ ...details, odometerReplaced: true });
    expect(replaced.error?.issues[0]).toMatchObject({ path: ["odometerReplacedReason"], message: "Give a reason for the odometer replacement" });
  });

  it("mileage must not go below the reading before this visit unless the odometer was replaced", () => {
    expect(mileageProblem(43_000, 43_100, false)).toBe(
      "Mileage cannot be lower than the last recorded 43,100 km. Check the reading, or tick Odometer replaced and give a reason.",
    );
    expect(mileageProblem(43_000, 43_100, true)).toBeNull();
    expect(mileageProblem(43_100, 43_100, false)).toBeNull();
    expect(mileageProblem(10, null, false)).toBeNull();
  });
});

describe("check-in gate reasons", () => {
  const ready: CheckInGateFacts = {
    mileage: 48_250,
    serviceTypeId: "type",
    promisedAt: new Date("2026-11-28T15:00:00Z"),
    complaintCount: 3,
    fuelLevel: "HALF",
    checklist: allPresent(),
    consentState: "signed",
  };

  it("has no reasons once details, walk-around and consent are done", () => {
    const gates = checkInGates(ready, now);
    expect(gates).toEqual({ details: [], walkAround: [], consent: [] });
    expect(checkInStep(gates)).toBe("SEND_TO_WORKSHOP");
    expect(checkInGates({ ...ready, consentState: "legacy" }, now).consent).toEqual([]);
  });

  it("names each missing detail and the step that fixes it", () => {
    const gates = checkInGates({ ...ready, mileage: null, serviceTypeId: null, promisedAt: null, complaintCount: 0 }, now);
    expect(gates.details).toEqual([
      "Enter the current mileage on Details.",
      "Choose the service type on Details.",
      "Set the promised delivery on Details.",
      "Add at least one customer request on Details.",
    ]);
    expect(checkInStep(gates)).toBe("DETAILS");
    expect(checkInGates({ ...ready, promisedAt: new Date("2026-11-25T09:00:00Z") }, now).details).toEqual([
      "The promised delivery has passed. Set a new promised delivery on Details.",
    ]);
  });

  it("asks for the fuel level and counts unchecked items", () => {
    const { HUB_CAPS: _hub, CLOCK: _clock, ...partial } = allPresent();
    const gates = checkInGates({ ...ready, fuelLevel: null, checklist: partial }, now);
    expect(gates.walkAround).toEqual(["Record the fuel level on Walk-around.", "Check every checklist item on Walk-around (2 not checked)."]);
    expect(checkInStep(gates)).toBe("WALK_AROUND");
  });

  it.each([
    ["required", "Get the customer's signature on Customer consent."],
    ["stale", "Details changed after the customer signed. Ask the customer to sign again on Customer consent."],
    ["invalid", "The saved signature could not be verified. Ask the customer to sign again on Customer consent."],
  ] as const)("explains a %s consent", (consentState, reason) => {
    const gates = checkInGates({ ...ready, consentState }, now);
    expect(gates.consent).toEqual([reason]);
    expect(checkInStep(gates)).toBe("CUSTOMER_CONSENT");
  });
});

describe("photos", () => {
  it("reads PNG, JPEG and WebP sizes from their headers", () => {
    expect(imageSize(png(3, 2), "image/png")).toEqual({ width: 3, height: 2 });
    expect(imageSize(jpeg(640, 480), "image/jpeg")).toEqual({ width: 640, height: 480 });
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8X", 12, "ascii");
    webp.writeUIntLE(799, 24, 3);
    webp.writeUIntLE(599, 27, 3);
    expect(imageSize(webp, "image/webp")).toEqual({ width: 800, height: 600 });
    expect(imageSize(Buffer.from("not an image"), "image/jpeg")).toBeNull();
  });

  it("decodes an allowed photo with its hash", () => {
    const photo = decodePhoto(dataUrl("image/png", png(4, 4)));
    expect(photo).toMatchObject({ contentType: "image/png", width: 4, height: 4 });
    expect(photo.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses other types, unreadable images and oversized photos", () => {
    expect(() => decodePhoto(dataUrl("image/gif", png(1, 1)))).toThrow("Choose a JPEG, PNG or WebP photo");
    expect(() => decodePhoto(dataUrl("image/jpeg", Buffer.from("plain text")))).toThrow("The photo could not be read. Take it again");
    expect(() => decodePhoto(dataUrl("image/png", png(5000, 1)))).toThrow("The photo is too large. Use a photo up to 4096 pixels wide and high");
    const big = Buffer.concat([jpeg(10, 10), Buffer.alloc(PHOTO_MAX_BYTES)]);
    expect(() => decodePhoto(dataUrl("image/jpeg", big))).toThrow("The photo is too large. Use a photo under 2 MB");
  });

  it("needs a slot for a check-in photo and none for a damage photo", () => {
    const image = dataUrl("image/png", png(1, 1));
    expect(photoBody.safeParse({ requestId: REQUEST, category: "CHECK_IN", image }).error?.issues[0].message).toBe(
      "Choose Front, Rear, Left, Right or Odometer",
    );
    expect(photoBody.safeParse({ requestId: REQUEST, category: "DAMAGE", slot: "FRONT", image }).success).toBe(false);
    expect(photoBody.safeParse({ requestId: REQUEST, category: "CHECK_IN", slot: "ODOMETER", image }).success).toBe(true);
  });
});

describe("signed snapshot", () => {
  const record = {
    fuelLevel: "HALF",
    checklist: { HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING" },
    checklistNote: null,
    serviceBookSeen: true,
    serviceBookStamps: 3,
    noValuables: true,
    belongingsNote: "Umbrella in boot",
  };
  const marks = [
    { id: "b", type: "DENT", x: "71.5", y: 40, note: null, photoId: null, createdAt: new Date("2026-11-26T09:05:00Z") },
    { id: "a", type: "SCRATCH", x: 50, y: 95.555, note: "Rear bumper", photoId: "p1", createdAt: new Date("2026-11-26T09:01:00Z") },
  ];

  it("lists every item with its state and orders marks by time and photos by id", () => {
    const snapshot = checkInSnapshot(record, marks, [
      { id: "p2", category: "CHECK_IN", slot: "FRONT", sha256: "2".repeat(64) },
      { id: "p1", category: "DAMAGE", slot: null, sha256: "1".repeat(64) },
    ]);
    expect(snapshot.checklist).toHaveLength(25);
    expect(snapshot.checklist.find((item) => item.code === "HUB_CAPS")).toEqual({ code: "HUB_CAPS", label: "Hub caps", state: "MISSING" });
    expect(snapshot.checklist.find((item) => item.code === "CLOCK")?.state).toBeNull();
    expect(snapshot.damageMarks.map((mark) => [mark.id, mark.x, mark.y])).toEqual([
      ["a", 50, 95.56],
      ["b", 71.5, 40],
    ]);
    expect(snapshot.photos.map((photo) => photo.id)).toEqual(["p1", "p2"]);
  });

  it("is the same for the same walk-around whatever order the rows arrive in", () => {
    expect(checkInSnapshot(record, [...marks].reverse(), [])).toEqual(checkInSnapshot(record, marks, []));
    expect(checkInSnapshot(null, [], []).fuelLevel).toBeNull();
  });
});

describe("request changes", () => {
  const current = [
    { description: "AC not cooling well", complaintCodeId: null },
    { description: "Brake noise", complaintCodeId: "code" },
  ];
  it("ignores surrounding spaces and finds edits, codes, order and count", () => {
    expect(requestsChanged(current, [{ description: " AC not cooling well " }, { description: "Brake noise", complaintCodeId: "code" }])).toBe(false);
    expect(requestsChanged(current, [{ description: "AC not cooling well" }, { description: "Brake noise" }])).toBe(true);
    expect(requestsChanged(current, [...current].reverse())).toBe(true);
    expect(requestsChanged(current, current.slice(0, 1))).toBe(true);
  });
});
