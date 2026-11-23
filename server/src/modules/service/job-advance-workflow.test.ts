jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    jobCard: { findUnique: jest.fn(), update: jest.fn() },
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
    ).rejects.toThrow("positive advance");
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  },
);

it("also blocks automatic reopening from parts, returns or labour edits without an advance", async () => {
  await expect(
    jobWorkUpdate(prisma, { id: "job", status: "READY" }, "actor"),
  ).rejects.toThrow("positive advance");
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
