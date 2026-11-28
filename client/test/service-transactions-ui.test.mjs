import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const folder = "features/service-transactions/components/";
const job = {
  id: "job",
  branchId: "branch",
  jobNumber: "JOB-001",
  status: "OPEN",
  inspections: [],
  vehicleId: "vehicle",
  vehicle: {
    registrationNumber: "REG-001",
    vin: "SYNTHETICVIN",
    model: "Synthetic model",
    trim: "Variant",
  },
  mileage: 1234,
  estimates: [{ id: "estimate", version: 1, status: "Approved" }],
  campaigns: [],
};
function render(
  name,
  {
    permissions = [],
    card = job,
    data,
    error = false,
    props = {},
    source = name,
  } = {},
) {
  const cache = new Map();
  const queries = [];
  const mocks = {
    "features/inventory/hooks/use-parts": {
      usePart: (id) => {
        queries.push({ url: `part:${id}`, enabled: !!id });
        return {
          data: {
            partFlag: "O",
            uom: "UNIT",
            retailRate: 100,
            warrantyRate: 80,
          },
          isError: error,
          refetch: () => {},
        };
      },
      usePartStock: (id, enabled) => {
        queries.push({ url: `stock:${id}`, enabled });
        return {
          data: [
            {
              branchId: "other",
              quantity: 999,
              availableQuantity: 999,
              rackLocation: "Foreign rack",
            },
            {
              branchId: "branch",
              quantity: 10,
              availableQuantity: 8,
              rackLocation: "Rack A",
              binCard: "BIN-A",
            },
          ],
          isError: error,
          refetch: () => {},
        };
      },
    },
    "features/auth/hooks/use-auth": {
      useAuth: () => ({
        hasPermission: (permission) => permissions.includes(permission),
      }),
    },
    "features/service-transactions/hooks/use-service-transactions": {
      useServiceData: (url, enabled = true) => {
        queries.push({ url, enabled });
        return {
          data: url.includes("/requisitions/part-options")
            ? undefined
            : (data ?? {
                document: { id: "document", remarks: "Saved remarks" },
                requisitions: [],
                returnSlips: [],
                labourSlips: [],
              }),
          isError: error,
          isLoading: false,
          refetch: () => {},
        };
      },
    },
    "features/job-cards/components/WorkshopPicker": {
      WorkshopPicker: ({ label, disabled }) =>
        React.createElement(
          "label",
          null,
          label,
          React.createElement("input", {
            role: "combobox",
            disabled,
            readOnly: true,
          }),
        ),
    },
    "features/appointments/hooks/use-update-appointment": {
      useUpdateAppointment: () => ({ mutate: () => {}, isPending: false }),
    },
    "features/job-cards/components/JobCardOpeningModal": {
      JobCardOpeningModal: () => null,
    },
    "features/job-cards/components/opening/CustomerRequestsTab": {
      emptyRequest: () => ({
        description: "",
        complaintCodeId: "",
        spare: 0,
        oil: 0,
        labour: 0,
      }),
      CustomerRequestsTab: () =>
        React.createElement("p", null, "Detailed customer requests"),
      requestTotals: (rows) =>
        Object.fromEntries(
          ["spare", "oil", "labour"].map((key) => [
            key,
            rows.reduce(
              (total, row) => total + Math.round((row[key] ?? 0) * 100),
              0,
            ) / 100,
          ]),
        ),
    },
  };
  function load(file) {
    const relative = path
      .relative(root, file)
      .replaceAll("\\", "/")
      .replace(/\.tsx?$/, "");
    if (mocks[relative]) return mocks[relative];
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const require = (specifier) => {
      if (specifier === "next/link")
        return {
          __esModule: true,
          default: ({ children, ...props }) =>
            React.createElement("a", props, children),
        };
      if (!specifier.startsWith("@/") && !specifier.startsWith("."))
        return dependency(specifier);
      const base = specifier.startsWith("@/")
        ? path.join(root, specifier.slice(2))
        : path.resolve(path.dirname(file), specifier);
      const target = [".tsx", ".ts", ".js", "/index.ts"]
        .map((ext) => base + ext)
        .find((candidate) => fs.existsSync(candidate));
      if (!target) throw new Error(`Cannot resolve ${specifier}`);
      return load(target);
    };
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      {
        module,
        exports: module.exports,
        require,
        Intl,
        Date,
        URLSearchParams,
        console,
      },
      { filename: file },
    );
    return module.exports;
  }
  const Component = load(path.join(root, folder + source + ".tsx"))[name];
  return {
    html: renderToStaticMarkup(
      React.createElement(Component, { job: card, ...props }),
    ),
    queries,
  };
}
test("print permission is checked before fetching an internal document", () => {
  const { html, queries } = render("ServiceDocumentPrint", {
    props: { kind: "job-picking", id: "job" },
  });
  assert.ok(html.includes("print permission"));
  assert.equal(
    queries.some((query) => query.enabled),
    false,
  );
});
test("picking output renders explicit internal fields and printable totals without leaking extra records", () => {
  const pickingList = {
    branch: { name: "Synthetic branch" },
    job: {
      number: "JOB-001",
      date: "2026-10-21T09:30:00Z",
      mileage: 1234,
      remarks: "Internal job remark",
    },
    estimate: {
      number: "EST-001",
      date: "2026-10-21T09:30:00Z",
      version: 2,
      status: "Approved",
      currency: "NGN",
      remarks: "Internal estimate remark",
    },
    vehicle: job.vehicle,
    lines: [
      {
        lineId: "line",
        partNumber: "PART-001",
        flag: "L",
        description: "Filter",
        uom: "UNIT",
        quantityRequired: 2,
        rate: 12.35,
        amount: 24.7,
      },
    ],
    totals: { numberOfItems: 1, quantityRequired: 2, totalAmount: 24.7 },
    printedAt: "2026-10-21T09:30:00Z",
    supplierPassword: "SECRET-NOT-PRINTABLE",
  };
  const { html, queries } = render("ServiceDocumentPrint", {
    permissions: ["jobcard:picking-list:print"],
    props: { kind: "job-picking", id: "job" },
    data: { pickingList },
  });
  for (const text of [
    "PART-001",
    "Quantity required",
    "revision 2",
    "Internal job remark",
    "Internal estimate remark",
    "Lagos time",
    "₦24.70",
  ])
    assert.ok(html.includes(text));
  assert.equal(html.includes("SECRET-NOT-PRINTABLE"), false);
  assert.equal(queries[0].url, "/service/job-cards/job/picking-list/print");
});
test("converted booking is read-only and links to its job instead of permitting another conversion", () => {
  const appointment = {
    id: "booking",
    branchId: "branch",
    customerId: "customer",
    vehicleId: "vehicle",
    scheduledAt: "2026-10-22T09:30:00Z",
    createdAt: "2026-10-21T09:30:00Z",
    status: "Pending",
    bookingStatus: "CONVERTED",
    bookingNumber: "BOOK-001",
    jobCards: [{ id: "linked", jobNumber: "JOB-001" }],
    requests: [],
  };
  const { html } = render("BookingPanel", {
    permissions: ["appointment:update", "jobcard:create"],
    props: { appointment },
  });
  assert.ok(html.includes("BOOK-001"));
  assert.ok(html.includes("/job-cards/linked"));
  assert.equal(html.includes("Convert to job card"), false);
  assert.equal(html.includes("Save booking details"), false);
});

test("return print rows distinguish required, issued and returned quantities with saved context", () => {
  const document = {
    returnNumber: "RET-001",
    lines: [
      {
        id: "line",
        partNumber: "PART-001",
        description: "Saved filter",
        quantityRequired: 5,
        quantityIssued: 3,
        quantity: 1,
        rate: "100.01",
        amount: "100.01",
        location: "Rack A",
        binCard: "BIN-A",
        warrantyRate: "80.00",
        uom: "UNIT",
      },
    ],
  };
  const { html } = render("SlipRows", {
    source: "ServiceDocumentPrint",
    props: { document },
  });
  for (const quantity of [5, 3, 1])
    assert.ok(html.includes(`tabular-nums">${quantity}</td>`));
  for (const text of [
    "Saved filter",
    "Rack A",
    "BIN-A",
    "UNIT",
    "Warranty rate:",
  ])
    assert.ok(html.includes(text));
});

test("legacy uppercase cancelled bookings hide editing and conversion actions", () => {
  const appointment = {
    id: "legacy",
    customerId: "customer",
    vehicleId: "vehicle",
    status: "CANCELLED",
    bookingStatus: "BOOKED",
    scheduledAt: "2026-11-17T09:00:00Z",
    createdAt: "2026-11-16T09:00:00Z",
    requests: [],
    jobCards: [],
  };
  const { html } = render("BookingPanel", {
    permissions: ["appointment:update", "jobcard:create"],
    props: { appointment },
  });
  assert.equal(html.includes("Save booking details"), false);
  assert.equal(html.includes("Convert to job card"), false);
});

test("internal picking headers show the job date, service code and checklist context", () => {
  const pickingList = {
    branch: { name: "Branch" },
    job: {
      number: "JOB-001",
      date: "2026-11-15T09:00:00Z",
      mileage: 1234,
      remarks: null,
      service: { code: "SERVICE-A", description: "Service A" },
    },
    estimate: {
      number: "EST-001",
      date: "2026-11-16T09:00:00Z",
      version: 1,
      status: "Approved",
      currency: "NGN",
      remarks: null,
    },
    checklist: {
      code: "CHECK-A",
      description: "Saved checklist",
      text: "CHECK-A",
    },
    vehicle: job.vehicle,
    lines: [],
    totals: { numberOfItems: 0, quantityRequired: 0, totalAmount: 0 },
    printedAt: "2026-11-16T10:00:00Z",
  };
  const props = { kind: "job-picking", id: "job" };
  const { html } = render("ServiceDocumentPrint", {
    props,
    permissions: ["jobcard:picking-list:print"],
    data: { pickingList },
  });
  for (const text of [
    "Job date:",
    "Estimate date:",
    "CHECK-A",
    "Saved checklist",
    "SERVICE-A",
  ])
    assert.ok(html.includes(text));
  assert.ok(html.includes("15 Nov 2026"));
  assert.ok(html.includes("16 Nov 2026"));
  const missing = render("ServiceDocumentPrint", {
    props,
    permissions: ["jobcard:picking-list:print"],
    data: { pickingList: { ...pickingList, checklist: null } },
  }).html;
  assert.ok(missing.includes("Checklist code: Not provided"));
});

test("booking keeps simple text entry and reuses the request grid for detailed rows", () => {
  const simple = render("BookingFields", {
    props: {
      value: { requests: "Inspect brakes" },
      onChange: () => {},
      compact: true,
    },
  }).html;
  assert.ok(simple.includes("Inspect brakes"));
  assert.ok(simple.includes("Add request details"));
  const detailed = render("BookingFields", {
    props: {
      value: {
        requests: [
          {
            description: "Inspect brakes",
            spare: 0.1,
            oil: 0.2,
            labour: 12.35,
          },
        ],
      },
      onChange: () => {},
      compact: true,
    },
  }).html;
  assert.ok(detailed.includes("Detailed customer requests"));
  assert.equal(detailed.includes("Add request details"), false);
});

test("saved internal requisition rows print the requested part and escaped substitution reason", () => {
  const document = {
    lines: [
      {
        id: "line",
        sparePartId: "actual",
        partNumber: "SUPPLY-001",
        requestedSparePartId: "requested",
        requestedPartNumber: "REQUEST-001",
        substitutionReason: "Unavailable <part>",
        description: "Supply part",
        quantityRequired: 1,
        quantityIssued: 0,
        rate: 10,
        amount: 0,
      },
    ],
  };
  const { html } = render("SlipRows", {
    source: "ServiceDocumentPrint",
    props: { document },
  });
  assert.ok(html.includes("REQUEST-001"));
  assert.ok(html.includes("Unavailable &lt;part&gt;"));
});
