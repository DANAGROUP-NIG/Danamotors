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
  qcStatus: "Pending",
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
      useServiceAction: () => ({ mutate: () => {}, isPending: false }),
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
          error: typeof error === "object" ? error : undefined,
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
test("requisition stock preview uses the job branch and guards cached data by permission", () => {
  const props = { partId: "part", branchId: "branch" };
  const { html } = render("RequisitionStockPreview", {
    props,
    permissions: ["sparepart:read", "stock:read"],
  });
  for (const text of [
    "On hand: 10",
    "Available: 8",
    "Rack A",
    "BIN-A",
    "Normal rate",
    "Warranty rate",
  ])
    assert.ok(html.includes(text));
  assert.equal(html.includes("Foreign rack"), false);
  const denied = render("RequisitionStockPreview", { props });
  for (const text of ["Rack A", "BIN-A", "Normal rate", "Warranty rate"])
    assert.equal(denied.html.includes(text), false);
  assert.ok(denied.queries.every((query) => !query.enabled));
  const failed = render("RequisitionStockPreview", {
    props,
    permissions: ["stock:read"],
    error: true,
  });
  assert.ok(failed.html.includes("Could not load stock"));
  assert.ok(failed.html.includes("Retry stock"));
});

test("workspace hides all transaction actions without permissions", () =>
  assert.equal(render("ServiceTransactions").html, ""));

test("Technician assignment renders in the selected Labour tab", () => {
  const { html } = render("ServiceTransactions", {
    permissions: ["jobcard:read", "requisition:read"],
    props: { preferredTab: "Labour", labourAssignment: React.createElement("button", null, "Save Technician assignment") },
  });
  assert.match(html, /aria-selected="true" id="transaction-tab-Labour"/);
  assert.match(html, /id="transaction-panel-Labour"[^>]*>.*Save Technician assignment/);
});

test("a strict requisition stays read-only while parts issuance is blocked", () => {
  const { html } = render("RequisitionPanel", {
    permissions: ["requisition:create", "requisition:read"],
    card: { ...job, partsRequestedAt: "2026-11-26T10:00:00Z" },
    props: { workflow: { actions: { issueParts: { allowed: false, reason: "Waiting for estimate approval" } } } },
  });
  assert.match(html, /Waiting for estimate approval/);
  assert.doesNotMatch(html, /Save and issue parts/);
});

test("workflow history deep link selects the History tab and retains QC remarks", () => {
  const { html } = render("ServiceTransactions", {
    permissions: ["jobcard:read"],
    props: { preferredTab: "History", workflow: { history: [
      { id: "rework", toStatus: "REWORK", actorName: "QC staff", remarks: "Recheck the noise.", createdAt: "2026-11-26T10:00:00Z" },
    ] } },
  });
  assert.match(html, /aria-selected="true" id="transaction-tab-History"/);
  assert.match(html, /id="transaction-panel-History"[^>]*>.*Rework required.*Recheck the noise./);
});

test("job workflow renders QC controls only for reviewers and shows recorded activity", () => {
  const props = {
    branchId: "branch",
    jobCardId: "job",
    query: {
      isPending: false,
      isError: false,
      refetch: () => {},
      mutation: { isPending: false, mutate: () => {} },
      data: {
        stage: "AWAITING_QC",
        parts: [],
        history: [{ id: "opened", toStatus: "OPENED", actorName: "Service staff", remarks: null, createdAt: "2026-11-26T10:00:00Z" }],
        actions: { passQc: { allowed: false, code: "WORKFLOW_ROLE_REQUIRED" }, failQc: { allowed: false, code: "WORKFLOW_ROLE_REQUIRED" } },
      },
    },
  };
  const options = { props, source: "../../job-cards/components/JobCardWorkflowPanel" };
  assert.doesNotMatch(render("JobCardWorkflowPanel", options).html, /Record QC pass/);
  props.query.data.actions = { passQc: { allowed: true }, failQc: { allowed: true } };
  const { html } = render("JobCardWorkflowPanel", options);
  assert.match(html, /Record QC pass/);
  assert.match(html, /Record QC failure/);
  assert.match(html, /Service staff.*26 Nov 2026/);
});

test("requisition screen has required/issued quantities and hides unauthorized goodwill", () => {
  const { html } = render("RequisitionPanel", {
    permissions: ["requisition:create", "requisition:read"],
  });
  for (const text of [
    "Quantity required",
    "Quantity issued",
    "Save and issue parts",
    "No saved documents",
  ])
    assert.ok(html.includes(text));
  assert.equal(html.includes('value="GOODWILL"'), false);
  assert.ok(
    render("RequisitionPanel", {
      permissions: ["requisition:create", "requisition:goodwill"],
    }).html.includes('value="GOODWILL"'),
  );
});
test("closed-job requisition and labour forms are disabled", () => {
  for (const name of ["RequisitionPanel", "LabourPanel"]) {
    const { html } = render(name, {
      card: { ...job, status: "BILLED" },
      permissions: ["requisition:create", "jobcard:labour:update"],
    });
    assert.ok(html.includes('<fieldset disabled=""'));
    assert.ok(html.includes("read-only after billing"));
  }
});
test("return screen does not permit an empty return and displays load failures", () => {
  const { html } = render("ReturnPanel", {
    permissions: ["requisition:create", "requisition:read"],
  });
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save return slip/);
  assert.ok(
    render("ReturnPanel", {
      permissions: ["requisition:read"],
      error: true,
    }).html.includes("Could not load documents"),
  );
});
test("labour screen keeps a single technician assignment and separates work done", () => {
  const { html } = render("LabourPanel", {
    permissions: ["jobcard:labour:update", "jobcard:update", "employee:read"],
  });
  for (const text of [
    "Charged hours",
    "Technician",
    "Work done",
    "Mark vehicle ready",
  ])
    assert.ok(html.includes(text));
  assert.doesNotMatch(html, /engineer|mechanic/i);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Mark vehicle ready/);
  const ready = render("LabourPanel", {
    permissions: ["jobcard:update"],
    card: { ...job, status: "QC", qcStatus: "PASSED" },
  }).html;
  const button = ready.match(/<button[^>]*>Mark vehicle ready/)[0];
  assert.equal(button.includes('disabled=""'), false);
});
test("remarks remain editable on delivered jobs with the dedicated permission", () => {
  const { html } = render("RemarksPanel", {
    card: { ...job, status: "DELIVERED" },
    permissions: ["jobcard:read", "jobcard:remarks:update"],
  });
  assert.ok(html.includes("Changes are audited"));
  assert.ok(html.includes("Save remarks"));
  assert.equal(html.match(/<textarea[^>]*>/)[0].includes("disabled"), false);
  const readonly = render("RemarksPanel", {
    permissions: ["jobcard:read"],
  }).html;
  assert.equal(readonly.includes("Save remarks"), false);
  assert.ok(readonly.match(/<textarea[^>]*>/)[0].includes("disabled"));
});

test("remarks reports a server access denial without offering a retry", () => {
  const { html } = render("RemarksPanel", {
    permissions: ["jobcard:read", "jobcard:remarks:update"],
    error: { isAxiosError: true, response: { status: 403 } },
  });
  assert.match(html, /You do not have permission to read these remarks/);
  assert.doesNotMatch(html, /Retry|Save remarks/);
});
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
    "Revision 2",
    "Internal job remark",
    "Internal estimate remark",
    "Africa/Lagos",
    "24.70",
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
    source: "SavedSlip",
    props: { document },
  });
  for (const quantity of [5, 3, 1])
    assert.ok(html.includes(`class="p-2">${quantity}</td>`));
  for (const text of [
    "Saved filter",
    "Rack A",
    "BIN-A",
    "UNIT",
    "Warranty rate:",
  ])
    assert.ok(html.includes(text));
});

test("saved labour editors restore the campaign and goodwill reason", () => {
  const base = {
    id: "line",
    labourItemId: "operation",
    description: "Saved operation",
    rate: 100,
    amount: 200,
    chargedHours: 2,
    technicianId: "login",
    mechanicId: "employee",
  };
  const props = {
    slipId: "slip",
    branchId: "branch",
    campaigns: [{ campaignId: "campaign", campaignTitle: "Saved campaign" }],
  };
  const free = render("SavedLabourLine", {
    permissions: ["employee:read"],
    props: {
      ...props,
      line: {
        ...base,
        chargeLine: { chargeType: "FREE", campaignId: "campaign" },
      },
    },
  }).html;
  assert.match(free, /value="campaign" selected=""/);
  const goodwill = render("SavedLabourLine", {
    permissions: ["warranty:update"],
    props: {
      ...props,
      line: {
        ...base,
        chargeLine: {
          chargeType: "GOODWILL",
          chargeTypeReason: "Saved approval",
        },
      },
    },
  }).html;
  assert.ok(goodwill.includes('value="Saved approval"'));
  const grid = render("SlipRows", {
    source: "SavedSlip",
    props: {
      document: {
        lines: [
          { ...base, group: { code: "TEAM-A", description: "Saved team" } },
        ],
      },
    },
  }).html;
  assert.ok(grid.includes("Group: TEAM-A"));
  assert.ok(grid.includes("Saved team"));
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

test("remarks show document context and separate internal text from customer explanations", () => {
  const context = {
    documentNumber: "EST-001",
    documentDate: "2026-11-16T09:00:00Z",
    status: "Approved",
    jobNumber: "JOB-001",
    jobDate: "2026-11-15T09:00:00Z",
    customerName: "Synthetic customer",
    mileage: 1234,
    vehicle: {
      vin: "SYNTHETICVIN",
      registrationNumber: "REG-001",
      model: "Model A",
      trim: "Variant A",
    },
    service: { code: "SERVICE-A", description: "Service A" },
  };
  const { html } = render("RemarksPanel", {
    permissions: ["jobcard:read", "jobcard:remarks:update"],
    data: {
      document: {
        id: "job",
        remarks: "Internal only",
        customerRemarks: "Customer explanation",
        context,
      },
    },
  });
  for (const text of [
    "EST-001",
    "JOB-001",
    "Synthetic customer",
    "SYNTHETICVIN",
    "Model A",
    "Variant A",
    "SERVICE-A",
    "Internal remarks",
    "Customer explanation (prints)",
  ])
    assert.ok(html.includes(text));
  const print = render("CustomerExplanation", {
    source: "../../../components/CustomerExplanation",
    props: { text: "Public <explanation>", remarks: "Internal secret" },
  }).html;
  assert.ok(print.includes("Public &lt;explanation&gt;"));
  assert.equal(print.includes("Internal secret"), false);
  assert.equal(
    render("CustomerExplanation", {
      source: "../../../components/CustomerExplanation",
      props: { text: null },
    }).html,
    "",
  );
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
  assert.ok(missing.includes("Checklist code: Not recorded"));
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

test("alternate chooser keeps catalogue identity and loads options only on demand", () => {
  const { html, queries } = render("RequisitionPartChooser", {
    permissions: ["sparepart:read", "stock:read", "requisition:create"],
    props: {
      requestedId: "",
      actualId: "",
      branchId: "branch",
      label: "Requested part",
      chargeType: "CUSTOMER",
      onRequested() {},
      onSupply() {},
    },
  });
  assert.ok(html.includes("Choose a requested part"));
  assert.ok(
    queries.some(
      (query) =>
        query.url.includes("/requisitions/part-options") &&
        query.enabled === false,
    ),
  );
  const denied = render("RequisitionPartChooser", {
    props: {
      requestedId: "private-id",
      actualId: "private-id",
      branchId: "branch",
      label: "Requested part",
      chargeType: "CUSTOMER",
      onRequested() {},
      onSupply() {},
    },
  });
  assert.ok(denied.html.includes("unavailable with your permissions"));
  assert.equal(denied.html.includes("private-id"), false);
  assert.ok(denied.queries.every((query) => query.enabled === false));
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
    source: "SavedSlip",
    props: { document },
  });
  assert.ok(html.includes("REQUEST-001"));
  assert.ok(html.includes("Unavailable &lt;part&gt;"));
});
