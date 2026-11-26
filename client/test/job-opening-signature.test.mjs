import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const dependency = createRequire(import.meta.url);
function load(file, stubs = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(
    new URL("../" + file, import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      crypto: { randomUUID: () => "retry-key" },
      require: (name) => (name in stubs ? stubs[name] : dependency(name)),
    },
  );
  return module.exports;
}
const document = {
  version: 1,
  termsVersion: "0".repeat(64),
  statement: "Opening approval is separate from repair-cost approval.",
  terms: ["Original signed terms"],
  footer: "Original footer",
  scope: {
    jobCardId: "job",
    jobNumber: "J1",
    branchId: "branch",
    branchName: "Test branch",
    customerId: "customer",
    customerName: "Test Customer",
    vehicleId: "vehicle",
    registration: "SYNTHETIC",
    vin: "SYNTHETIC-VIN",
    mileage: 100,
    openedAt: "2026-11-17T23:30:00Z",
    promisedAt: "2026-11-20T14:00:00Z",
    service: "Inspection",
    description: "Inspect vehicle",
    requests: [
      {
        id: "request",
        complaintCodeId: null,
        defectCode: null,
        description: "Brake noise",
      },
    ],
  },
};
const signature = {
  id: "signature",
  revision: 1,
  signerName: "Test Customer",
  relationship: "Vehicle owner",
  signedAt: "2026-11-17T23:30:00Z",
  signatureImage: "data:image/png;base64,SYNTHETIC",
};
const format = load("lib/format.ts");
// check-in.logic words the check-in warranty alert with the warranty check's logic (phase 4).
const warrantyLogic = load("features/job-cards/lib/warranty-check.logic.ts", { "@/lib/format": format });
const checkInLogic = load("features/job-cards/lib/check-in.logic.ts", { "@/lib/format": format, "./warranty-check.logic": warrantyLogic });
const documentComponent = load(
  "features/job-cards/components/JobOpeningDocument.tsx",
  { "@/lib/format": format, "../lib/check-in.logic": checkInLogic },
);
const button = {
  Button: ({ children, asChild, ...props }) =>
    asChild ? children : React.createElement("button", props, children),
};
const loading = {
  LoadingSkeleton: ({ label }) =>
    React.createElement("p", { role: "status" }, label),
};

function print({
  allowed = true,
  data = { document, signature, current: true },
  isError = false,
  isLoading = false,
} = {}) {
  const Page = load(
    "app/(dashboard)/job-cards/[id]/opening-consent/[signatureId]/print/page.tsx",
    {
      "next/navigation": {
        useParams: () => ({ id: "job", signatureId: "signature" }),
      },
      "@/features/auth/hooks/use-auth": {
        useAuth: () => ({ hasPermission: () => allowed }),
      },
      "@/features/job-cards/hooks/use-job-opening-consent": {
        useJobOpeningPrint: () => ({ data, isError, isLoading, refetch() {} }),
      },
      "@/lib/format": format,
      "@/features/job-cards/components/JobOpeningDocument": documentComponent,
      "@/components/ui/button": button,
      "@/components/ui/loading-skeleton": loading,
      "next/image": {
        default: (props) => {
          const attributes = { ...props };
          delete attributes.unoptimized;
          return React.createElement("img", attributes);
        },
      },
    },
  ).default;
  return renderToStaticMarkup(React.createElement(Page));
}

test("signed print renders original scope, terms, signature and Lagos timestamp without internal data", () => {
  const html = print({
    data: {
      document,
      signature,
      current: false,
      internalRemarks: "SECRET-REMARKS",
    },
  });
  for (const text of [
    "J1",
    "SYNTHETIC",
    "Brake noise",
    "Original signed terms",
    "Original footer",
    "Test Customer",
    "18 Nov 2026",
    "original signed snapshot",
  ])
    assert.ok(html.includes(text));
  assert.ok(html.includes("Captured customer job-opening signature"));
  assert.ok(html.includes(signature.signatureImage));
  assert.equal(html.includes("SECRET-REMARKS"), false);
  assert.equal(html.includes("undefined"), false);
  assert.equal(html.includes("NaN"), false);
});

test("signed print covers permission denial, loading and reloadable errors without leaking evidence", () => {
  assert.ok(print({ allowed: false }).includes("do not have permission"));
  assert.equal(
    print({ allowed: false }).includes(signature.signatureImage),
    false,
  );
  assert.ok(
    print({ isLoading: true }).includes("Loading signed job-opening consent"),
  );
  assert.ok(print({ isError: true }).includes("Reload signed consent"));
});

test("a version 2 signed copy shows the walk-around the customer confirmed and the representative's phone", () => {
  const v2 = {
    ...document,
    version: 2,
    scope: {
      ...document.scope,
      checkIn: {
        fuelLevel: "HALF",
        checklist: [
          { code: "HUB_CAPS", label: "Hub caps", state: "MISSING" },
          { code: "AC_WORKING", label: "AC working", state: "NOT_WORKING" },
          { code: "CLOCK", label: "Clock", state: "PRESENT" },
        ],
        checklistNote: null,
        serviceBookSeen: true,
        serviceBookStamps: 3,
        noValuables: true,
        belongingsNote: "Umbrella in boot",
        damageMarks: [{ id: "m", type: "DENT", x: 80, y: 42, note: null, photoId: null }],
        photos: [{ id: "p", category: "CHECK_IN", slot: "FRONT", sha256: "a".repeat(64) }],
      },
    },
  };
  const html = print({ data: { document: v2, signature: { ...signature, relationship: "Driver", signerPhone: "0803 555 0199" }, current: true } });
  for (const text of ["Vehicle condition at check-in", "Half (1/2)", "Dent on front right door", "Hub caps", "Missing", "Not working", "Umbrella in boot", "Seen, 3 stamps", "0803 555 0199"])
    assert.ok(html.includes(text), text);
  assert.equal(/undefined|null|NaN|NOT_WORKING|DENT</.test(html), false);
});
