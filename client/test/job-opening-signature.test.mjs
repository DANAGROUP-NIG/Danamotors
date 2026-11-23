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
const consent = {
  document,
  expectedHash: "hash",
  state: "required",
  signature: null,
};
const logic = load("features/service-transactions/transaction.logic.ts");
const documentComponent = load(
  "features/job-cards/components/JobOpeningDocument.tsx",
  { "@/features/service-transactions/transaction.logic": logic },
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
      "@/features/service-transactions/transaction.logic": logic,
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

function card({
  value = consent,
  allowed = true,
  isLoading = false,
  isError = false,
  modalStates,
  pending = false,
  closed = false,
} = {}) {
  const state = [...(modalStates ?? [])];
  const react = modalStates
    ? {
        ...React,
        useState: (initial) => [
          state.length
            ? state.shift()
            : typeof initial === "function"
              ? initial()
              : initial,
          () => {},
        ],
      }
    : React;
  const Card = load("features/job-cards/components/JobOpeningConsentCard.tsx", {
    react,
    "@/features/auth/hooks/use-auth": {
      useAuth: () => ({ hasPermission: () => allowed }),
    },
    "../hooks/use-job-opening-consent": {
      useJobOpeningConsent: () => ({
        data: value,
        isLoading,
        isError,
        refetch() {},
      }),
      useSignJobOpening: () => ({
        isPending: pending,
        error: null,
        mutate() {},
      }),
    },
    "@/features/service-transactions/transaction.logic": logic,
    "./JobOpeningDocument": documentComponent,
    "./SignaturePad": {
      SignaturePad: ({ label }) =>
        React.createElement("canvas", { "aria-label": label }),
    },
    "@/components/modals/ModalFame": {
      default: ({ children, title }) =>
        React.createElement(
          "section",
          { role: "dialog", "aria-label": title },
          children,
        ),
    },
    "@/components/forms/FormField": load("components/forms/FormField.tsx"),
    "@/components/ui/button": button,
    "@/components/ui/loading-skeleton": loading,
    "next/link": {
      default: ({ children, ...props }) =>
        React.createElement("a", props, children),
    },
  }).JobOpeningConsentCard;
  return renderToStaticMarkup(
    React.createElement(Card, { jobCardId: "job", closed }),
  );
}

test("opening card covers required, signed, stale, legacy, closed, loading and error states", () => {
  assert.ok(card().includes("Customer signature required before work starts"));
  assert.ok(
    card({ value: { ...consent, state: "signed", signature } }).includes(
      "Print signed job opening",
    ),
  );
  assert.ok(
    card({ value: { ...consent, state: "stale", signature } }).includes(
      "obtain a new signature",
    ),
  );
  assert.ok(
    card({ value: { ...consent, state: "legacy" } }).includes("Historical job"),
  );
  assert.equal(
    card({ closed: true }).includes("Get job-opening signature"),
    false,
  );
  assert.equal(card({ allowed: false }), "");
  assert.ok(card({ isLoading: true }).includes("Loading job-opening consent"));
  assert.ok(card({ isError: true }).includes("Reload consent"));
});

test("signature form disables submission without acceptance, drawing or representative authority", () => {
  const states = [true, "Test Customer", "", false, null, "retry-key"];
  const incomplete = card({ modalStates: states });
  assert.match(
    incomplete,
    /<button[^>]*disabled=""[^>]*>Save signed job-opening approval/,
  );
  const complete = card({
    modalStates: [
      true,
      "Test Customer",
      "",
      true,
      signature.signatureImage,
      "retry-key",
    ],
  });
  assert.match(
    complete,
    /<button type="button">Save signed job-opening approval/,
  );
  const representative = card({
    modalStates: [
      true,
      "Fleet representative",
      "",
      true,
      signature.signatureImage,
      "retry-key",
    ],
  });
  assert.ok(representative.includes("Explain who is signing for the customer"));
  assert.match(
    representative,
    /<button[^>]*disabled=""[^>]*>Save signed job-opening approval/,
  );
  assert.ok(
    card({
      pending: true,
      modalStates: [
        true,
        "Test Customer",
        "",
        true,
        signature.signatureImage,
        "retry-key",
      ],
    }).includes("Saving signature"),
  );
});
