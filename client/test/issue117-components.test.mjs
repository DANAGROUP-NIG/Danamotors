import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const loadDependency = createRequire(import.meta.url);
function load(file, stubs = {}) {
  const output = ts.transpileModule(
    fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    output,
    {
      module,
      exports: module.exports,
      require: (name) => (name in stubs ? stubs[name] : loadDependency(name)),
    },
    { filename: file },
  );
  return module.exports;
}
test("signature dialog required fields", () => {
  const { signatureFieldsValid: valid } = load(
    "features/job-cards/components/signature-fields.ts",
  );
  const fields = {
    drawn: true,
    name: "Test Customer",
    customerName: "Test Customer",
    relationship: "",
    approved: true,
    reason: "",
  };
  assert.equal(valid(fields), true);
  for (const patch of [
    { drawn: false },
    { name: " " },
    { approved: false },
    { name: "Other signer" },
  ])
    assert.equal(valid({ ...fields, ...patch }), false);
  assert.equal(
    valid({ ...fields, approved: false, reason: "Not agreed" }),
    true,
  );
  assert.equal(
    valid({
      ...fields,
      name: "Other signer",
      relationship: "Authorized contact",
    }),
    true,
  );
});
test("print component excludes internal fields and handles unsigned/superseded versions", () => {
  const data = {
    estimate: {
      customerRemarks: "CUSTOMER-EXPLANATION",
      remarks: "SECRET-REMARK",
      version: 2,
      estimateNumber: "TEST-2",
      estimateDate: "2026-10-20T10:00:00Z",
      currency: "NGN",
      total: 100,
      vatRate: 7.5,
      totals: { customerSubtotal: 100, vat: 7.5, customerTotal: 107.5, otherPayerTotal: 0, approvedTotal: 107.5 },
      phoneApproval: null,
      supersededBy: 3,
      signatureState: null,
      signature: null,
      lines: [
        {
          type: "PART",
          code: "P1",
          description: "Customer part",
          quantity: 1,
          rate: 100,
          amount: 100,
          source: "SECRET-SOURCE",
          cost: 50,
          chargeType: "WARRANTY",
          payer: "CUSTOMER",
          customerDecision: null,
        },
      ],
    },
    company: { name: "Test Company" },
    branch: { name: "Test Branch" },
    customer: { name: "Test Customer" },
    vehicle: { vin: "TESTVIN" },
    job: {
      number: "J1",
      date: "2026-10-20T10:00:00Z",
      complaints: ["Customer complaint"],
    },
    terms: ["Test terms"],
    footer: "Test footer",
    printedAt: "2026-10-20T10:00:00Z",
    internalRemarks: "SECRET-REMARK",
    qc: "SECRET-QC",
    assignments: "SECRET-STAFF",
    otherEstimates: "SECRET-ESTIMATE",
  };
  let allowed = true;
  const Page = load(
    "app/(dashboard)/job-cards/[id]/estimates/[estimateId]/print/page.tsx",
    {
      "next/navigation": {
        useParams: () => ({ id: "job", estimateId: "estimate" }),
      },
      "@tanstack/react-query": {
        useQuery: () => ({ data, isPending: false, isError: false }),
      },
      "@/lib/api/apiClient": {},
      "@/components/ui/loading-skeleton": { LoadingSkeleton: () => null },
      "@/features/auth/hooks/use-auth": {
        useAuth: () => ({ hasPermission: () => allowed }),
      },
      "@/components/CustomerExplanation": load(
        "components/CustomerExplanation.tsx",
      ),
      "@/features/service-transactions/transaction.logic": load(
        "features/service-transactions/transaction.logic.ts",
      ),
      "@/features/job-cards/lib/estimate.logic": load("features/job-cards/lib/estimate.logic.ts"),
      "@/lib/format": load("lib/format.ts"),
      "@/components/ui/button": {
        Button: ({ children }) => React.createElement("button", null, children),
      },
    },
  ).default;
  data.estimate.upfrontPaymentPercent = 60;
  data.estimate.upfrontAmount = 60;
  let html = renderToStaticMarkup(React.createElement(Page));
  assert.ok(html.includes("Suggested advance (60%)"));
  assert.ok(html.includes("\u20a660.00"));
  assert.ok(
    html.includes(
      "Any positive eligible advance meets the payment requirement.",
    ),
  );
  for (const excluded of [
    "SECRET-SOURCE",
    "WARRANTY",
    "SECRET-REMARK",
    "SECRET-QC",
    "SECRET-STAFF",
    "SECRET-ESTIMATE",
  ])
    assert.equal(html.includes(excluded), false);
  for (const included of [
    "Not a bill",
    "Customer part",
    "Customer pays",
    "VAT (7.5%)",
    "Customer signature:",
    "Superseded by revision",
    "Test terms",
    "CUSTOMER-EXPLANATION",
  ])
    assert.equal(html.includes(included), true);
  data.estimate.signature = {
    imageReference: "data:image/png;base64,TEST",
    signerName: "Test Signer",
    signedAt: "2026-10-20T10:00:00Z",
    estimateVersion: 2,
    totalSigned: 100,
  };
  data.estimate.signatureState = "valid";
  html = renderToStaticMarkup(React.createElement(Page));
  assert.equal(html.includes("Test Signer"), true);
  assert.equal(html.includes("Captured customer signature"), true);
  allowed = false;
  html = renderToStaticMarkup(React.createElement(Page));
  assert.equal(html.includes("do not have permission"), true);
  assert.equal(html.includes("Customer part"), false);
});

test("combined and legacy bills print explicit job explanations without internal remarks", () => {
  const invoice = {
    id: "bill",
    status: "Issued",
    invoiceNumber: "BILL-001",
    issuedDate: "2026-11-16T09:00:00Z",
    customer: { firstName: "Synthetic", lastName: "Customer" },
    total: 10,
    outstandingAmount: 10,
    allocations: [],
    lines: [],
    partsTotal: 10,
    partsDiscountPercent: 0,
    partsDiscountAmount: 0,
    labourTotal: 0,
    labourDiscountPercent: 0,
    labourDiscountAmount: 0,
    vatAmount: 0,
    roundOff: 0,
    jobCards: [
      {
        id: "one",
        jobNumber: "JOB-1",
        customerRemarks: "PUBLIC-ONE",
        remarks: "SECRET-ONE",
      },
      {
        id: "two",
        jobNumber: "JOB-2",
        customerRemarks: "PUBLIC-TWO",
        remarks: "SECRET-TWO",
      },
    ],
  };
  const Page = load("features/invoices/components/InvoiceDetailPage.tsx", {
    "next/link": {
      default: ({ children }) => React.createElement("a", null, children),
    },
    "next/navigation": { useParams: () => ({ id: "bill" }) },
    "../hooks/use-invoice": { useInvoice: () => ({ data: invoice }) },
    "@/features/auth/hooks/use-auth": {
      useAuth: () => ({ hasPermission: () => false }),
    },
    "@/components/ui/loading-skeleton": { LoadingSkeleton: () => null },
    "@/components/ui/button": {
      Button: ({ children }) => React.createElement("button", null, children),
    },
    "@/components/CustomerExplanation": load(
      "components/CustomerExplanation.tsx",
    ),
    "@/components/DocumentTermsBlock": { DocumentTermsBlock: () => null },
    "./VatBreakdownTable": { VatBreakdownTable: () => null },
    "./PaymentReceiptModal": { PaymentReceiptModal: () => null },
    "./CancelJobBillModal": { CancelJobBillModal: () => null },
  }).InvoiceDetailPage;
  const html = renderToStaticMarkup(React.createElement(Page));
  for (const text of ["PUBLIC-ONE", "PUBLIC-TWO", "JOB-1", "JOB-2"])
    assert.ok(html.includes(text));
  assert.equal(html.includes("SECRET-ONE"), false);
  assert.equal(html.includes("SECRET-TWO"), false);
  invoice.jobCard = invoice.jobCards[0];
  invoice.jobCards = [];
  const legacy = renderToStaticMarkup(React.createElement(Page));
  assert.ok(legacy.includes("PUBLIC-ONE"));
  assert.equal(legacy.includes("SECRET-ONE"), false);
});
