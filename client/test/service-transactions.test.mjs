import test from "node:test";

import assert from "node:assert/strict";

import fs from "node:fs";

import path from "node:path";

import vm from "node:vm";

import { createRequire } from "node:module";

import { fileURLToPath } from "node:url";

import ts from "typescript";

const require = createRequire(import.meta.url);

const root = fileURLToPath(new URL("../", import.meta.url));

function load(relative) {
  const file = path.join(root, relative);

  const module = { exports: {} };

  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    {
      require: (spec) => (spec.startsWith("@/") ? load(`${spec.slice(2)}.ts`) : require(spec)),
      module,
      exports: module.exports,
      Intl,
      Date,
    },
    { filename: file },
  );

  return module.exports;
}

const logic = load("features/service-transactions/transaction.logic.ts");

test("booking date entry and output use Lagos independently of the browser timezone", () => {
  assert.equal(logic.lagosIso("2026-10-21T10:30"), "2026-10-21T09:30:00.000Z");

  assert.equal(
    logic.lagosIso("2026-10-21T09:30:00Z"),
    "2026-10-21T09:30:00.000Z",
  );

  assert.equal(logic.lagosInput("2026-10-21T23:30:00Z"), "2026-10-22T00:30");
});

test("booking catalogue service remains optional", () => {
  const schema = load(
    "features/appointments/schemas/appointment.schema.ts",
  ).createAppointmentSchema;

  assert.equal(
    schema.safeParse({
      customerId: "customer",
      vehicleId: "vehicle",
      branchName: "branch",
      scheduledAt: "2026-10-21T10:30",
    }).success,
    true,
  );
});

test("returns count only active previous returns and never expose a negative allowance", () => {
  assert.equal(
    logic.remainingReturn({
      quantityIssued: 5,
      returns: [
        { quantity: 2, status: "Completed" },
        { quantity: 3, status: "Cancelled" },
      ],
    }),
    3,
  );

  assert.equal(
    logic.remainingReturn({
      quantityIssued: 1,
      returns: [{ quantity: 2, status: "Completed" }],
    }),
    0,
  );
});

const booking = load("features/service-transactions/booking.logic.ts");
test("conversion starts from the saved booking and leaves an editable blank complaint for optional requests", () => {
  const source = {
    id: "booking",
    customerId: "customer",
    vehicleId: "vehicle",
    branch: { name: "Branch" },
    serviceTypeId: "service",
    mileage: 42,
    requests: [
      {
        description: "Saved noise",
        complaintCodeId: null,
        defectCode: "DEFECT",
        estimatedParts: "0.10",
        estimatedOil: "0.20",
        estimatedLabour: "12.35",
      },
    ],
  };
  const values = booking.bookingOpeningValues(source);
  assert.equal(values.appointmentId, "booking");
  assert.equal(values.customerId, "customer");
  assert.equal(values.vehicleId, "vehicle");
  assert.equal(values.complaints[0].spare, 0.1);
  assert.equal(values.complaints[0].description, "Saved noise");
  assert.equal(
    booking.bookingOpeningValues({ ...source, requests: [] }).complaints.length,
    1,
  );
  assert.equal(
    booking.bookingOpeningValues({ ...source, requests: [] }).complaints[0]
      .description,
    "",
  );
});
test("converted, linked and terminal legacy bookings cannot be edited", () => {
  for (const bookingStatus of ["CONVERTED", "CANCELLED", "NO_SHOW"])
    assert.equal(
      logic.canEditBooking({ status: "Pending", bookingStatus }),
      false,
    );
  assert.equal(logic.canEditBooking({ status: "Completed" }), false);
  assert.equal(
    logic.canEditBooking({ status: "Pending", jobCards: [{}] }),
    false,
  );
  assert.equal(
    logic.canEditBooking({ status: "Pending", bookingStatus: "BOOKED" }),
    true,
  );
});

test("job opening uses the conversion endpoint only for a linked booking", async () => {
  const requests = [];
  const module = { exports: {} };
  const source = fs.readFileSync(
    path.join(root, "features/job-cards/api/job-card.api.ts"),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      URLSearchParams,
      require: (name) =>
        name.endsWith("apiClient")
          ? {
              apiPost: async (url, body) => {
                requests.push({ url, body });
                return { jobCard: { id: "created-job" } };
              },
            }
          : {
              API_ROUTES: {
                service: { jobCards: { base: "/service/job-cards" } },
              },
            },
    },
  );
  assert.equal(
    (
      await module.exports.createJobCardRequest({
        appointmentId: "saved-booking",
        vehicleId: "vehicle",
        serviceId: "",
      })
    ).id,
    "created-job",
  );
  await module.exports.createJobCardRequest({
    appointmentId: "",
    vehicleId: "vehicle",
  });
  assert.equal(requests[0].url, "/service/appointments/saved-booking/convert");
  assert.equal(requests[0].body.serviceId, undefined);
  assert.equal(requests[1].url, "/service/job-cards");
});

test("legacy terminal booking spellings stay read-only", () => {
  for (const status of [
    "CANCELLED",
    "canceled",
    " cancelled ",
    "COMPLETED",
    "closed",
    "NO_SHOW",
    "no-show",
  ]) {
    assert.equal(
      logic.canEditBooking({ status, bookingStatus: "BOOKED" }),
      false,
    );
  }
  assert.equal(
    logic.canEditBooking({ status: "Checked In", bookingStatus: "BOOKED" }),
    true,
  );
});

test("detailed booking edits preserve saved codes, decimal amounts and request identity", () => {
  const appointment = {
    id: "booking",
    requests: [
      {
        id: "stored",
        complaintCodeId: "code",
        defectCode: "DEFECT",
        description: "Inspect brakes",
        estimatedParts: "0.10",
        estimatedOil: "0.20",
        estimatedLabour: "12.35",
      },
    ],
  };
  const extra = booking.bookingExtras(appointment);
  assert.ok(Array.isArray(extra.requests));
  const payload = booking.bookingRequestPayload(extra.requests);
  assert.equal(payload[0].spare, 0.1);
  assert.equal(payload[0].oil, 0.2);
  assert.equal(payload[0].labour, 12.35);
  assert.equal(payload[0].complaintCodeId, "code");
  assert.equal(payload[0].defectCode, "DEFECT");
  assert.equal(Object.hasOwn(payload[0], "id"), false);
  assert.equal(
    booking.bookingRequestsEqual(
      extra.requests,
      booking.bookingExtras(appointment).requests,
    ),
    true,
  );
  const edited = extra.requests.map((row) => ({
    ...row,
    description: "Updated request",
  }));
  assert.equal(booking.bookingRequestsEqual(edited, extra.requests), false);
  assert.equal(booking.bookingRequestPayload(edited)[0].labour, 12.35);
  assert.equal(booking.bookingRequestsValid(edited), true);
  assert.equal(booking.bookingRequestsValid([]), false);
  assert.equal(booking.bookingRequestsValid("  "), false);
  assert.equal(booking.bookingRequestsValid("Inspect brakes"), true);
  assert.equal(
    booking.bookingRequestsEqual("Inspect brakes", [
      {
        description: "Inspect brakes",
        complaintCodeId: "",
        spare: 0,
        oil: 0,
        labour: 0,
      },
    ]),
    true,
  );
});

test("slip totals print with labels in a fixed order and money flagged", () => {
  const rows = logic.slipTotals({ totalAmount: 250.5, numberOfItems: 2, netQuantityIssued: 3, internalCode: 7 });
  assert.deepEqual(
    JSON.parse(JSON.stringify(rows.map((row) => [row.label, row.value, row.money]))),
    [
      ["Number of items", 2, false],
      ["Net quantity issued", 3, false],
      ["Total amount", 250.5, true],
    ],
  );
  assert.equal(logic.slipTotals(undefined).length, 0);
  assert.equal(logic.serviceDocumentLabel(null), "Not provided");
  assert.equal(logic.serviceDocumentLabel("goodwill"), "Goodwill");
});
