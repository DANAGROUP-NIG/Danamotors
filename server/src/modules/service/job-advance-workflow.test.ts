jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    jobCard: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    estimate: { findFirst: jest.fn() },
    receipt: { findFirst: jest.fn() },
    jobOpeningSignature: { findFirst: jest.fn() },
  },
}));
jest.mock("./estimate-approval", () => ({
  assertApprovedOperation: jest.fn(),
  assertRecordedScope: jest.fn(),
}));
import prisma from "../../prisma/client";
import { JobCardWorkflowService } from "./job-card-workflow.service";
import { jobWorkUpdate } from "../requisition/requisition-work";

beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
    callback(prisma),
  );
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue(null);
  // No exemption and a customer-pay estimate: the advance is needed.
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ advanceExemption: null, advanceExemptionReason: null });
  (prisma.estimate.findFirst as jest.Mock).mockResolvedValue({ vatRate: 7.5, lines: [{ payer: "CUSTOMER", amount: 100, customerDecision: null }] });
});

it("lets an exempt job start work without an advance", async () => {
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ advanceExemption: "INTERNAL", advanceExemptionReason: "Company pool car" });
  await expect(jobWorkUpdate(prisma, { id: "job", status: "READY" }, "actor")).resolves.toMatchObject({ status: "IN_PROGRESS" });
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ advanceExemption: null, advanceExemptionReason: null });
  (prisma.estimate.findFirst as jest.Mock).mockResolvedValue({ vatRate: 7.5, lines: [{ payer: "WARRANTY", amount: 100, customerDecision: null }] });
  await expect(jobWorkUpdate(prisma, { id: "job", status: "READY" }, "actor")).resolves.toMatchObject({ status: "IN_PROGRESS" });
});

it.each(["OPEN", "WAITING_PARTS", "QC"])(
  "blocks %s -> IN_PROGRESS without an advance, before changing the job",
  async (status) => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      id: "job",
      status,
      customerId: "customer",
      invoices: [],
      qcStatus: "FAILED",
    });
    await expect(
      new JobCardWorkflowService().update(
        "job",
        { status: "IN_PROGRESS" },
        "actor",
      ),
    ).rejects.toThrow("Ask the cashier to record the advance");
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  },
);

it("also blocks automatic reopening from parts, returns or labour edits without an advance", async () => {
  await expect(
    jobWorkUpdate(prisma, { id: "job", status: "READY" }, "actor"),
  ).rejects.toThrow("Ask the cashier to record the advance");
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue({ id: "receipt" });
  await expect(
    jobWorkUpdate(prisma, { id: "job", status: "READY" }, "actor"),
  ).resolves.toMatchObject({ status: "IN_PROGRESS", qcStatus: "PENDING" });
});

it("does not accept a payment or estimate approval as a substitute for a new-job opening signature", async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
    id: "job",
    status: "OPEN",
    openingSignatureRequired: true,
    customerId: "customer",
    invoices: [],
    consolidatedInvoices: [],
    branch: { name: "Test" },
    customer: { firstName: "Test", lastName: "Customer" },
    createdAt: new Date(),
    complaints: [],
  });
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue({ id: "receipt" });
  await expect(
    new JobCardWorkflowService().update(
      "job",
      { status: "IN_PROGRESS" },
      "actor",
    ),
  ).rejects.toMatchObject({ code: "JOB_OPENING_SIGNATURE_REQUIRED" });
  expect(prisma.jobCard.update).not.toHaveBeenCalled();
});

it("also requires signed opening consent before automatically reopening new jobs for rework", async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
    id: "job",
    openingSignatureRequired: true,
  });
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.receipt.findFirst as jest.Mock).mockResolvedValue({ id: "receipt" });
  await expect(
    jobWorkUpdate(
      prisma,
      { id: "job", status: "READY", openingSignatureRequired: true },
      "actor",
    ),
  ).rejects.toMatchObject({ code: "JOB_OPENING_SIGNATURE_REQUIRED" });
});
