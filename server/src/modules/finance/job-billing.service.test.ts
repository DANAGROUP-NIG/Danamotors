jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    jobCard: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    invoice: { create: jest.fn(), update: jest.fn() },
    receipt: { findMany: jest.fn(), update: jest.fn() },
    receiptAllocation: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    customer: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    financeSetting: { findUnique: jest.fn() },
    branchSettings: { findUnique: jest.fn() },
    documentSequence: { upsert: jest.fn() },
  },
}));

import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { JobBillingService } from "./job-billing.service";
import { ROLES } from "../../shared/constants/roles";

const input = {
  jobCardId: "job",
  serviceAdvisorId: "advisor",
  actorId: "actor",
  partsDiscountPercent: 0,
  labourDiscountPercent: 0,
};
const approved = {
  id: "estimate",
  status: "Approved",
  amount: 300,
  approvals: [{ approved: true, customerId: "customer" }],
  lines: [
    {
      type: "LABOUR",
      referenceId: "operation",
      description: "Repair",
      quantity: 1,
      rate: 100,
      amount: 100,
    },
    {
      type: "SERVICE",
      referenceId: "service",
      description: "Full service",
      quantity: 1,
      rate: 200,
      amount: 200,
    },
  ],
};
const card = {
  serviceId: "service",
  estimates: [approved],
  id: "job",
  customerId: "customer",
  branchId: "branch",
  status: "DELIVERED",
  qcStatus: "PASSED",
  creditApprovedById: "admin",
  gatePassNumber: "GP-1",
  deliveredAt: new Date("2026-01-01"),
  billedAt: null,
  invoices: [],
  partIssuances: [],
  labourLines: [
    {
      id: "labour",
      labourItemId: "operation",
      description: "Repair",
      hours: 1,
      rate: 100,
      amount: 100,
    },
  ],
};

describe("Job billing after delivery on credit", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.customer.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      creditDays: null,
    });
    (prisma.financeSetting.findUnique as jest.Mock).mockResolvedValue({
      value: 30,
    });
    (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
      callback(prisma),
    );
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(card);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "advisor",
      role: { name: ROLES.SERVICE_ADVISOR },
      isActive: true,
      branchId: "branch",
    });
    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({
      value: 1,
    });
    (prisma.customer.findUnique as jest.Mock).mockResolvedValue({
      id: "customer",
    });
    (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.invoice.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: "invoice", ...data }),
    );
    (prisma.invoice.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: "invoice", ...data }),
    );
  });

  it("creates a bill while preserving delivery and gate-pass details", async () => {
    await new JobBillingService().createJobBill(input);
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobCardId: "job",
          customerId: "customer",
          labourTotal: 100,
        }),
      }),
    );
    const data = (prisma.jobCard.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe("DELIVERED");
    expect(data.billedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty("deliveredAt");
    expect(data).not.toHaveProperty("gatePassNumber");
    expect(data.statusHistory.create).toEqual(
      expect.objectContaining({
        toStatus: "DELIVERED",
        actorId: "actor",
        remarks: expect.stringContaining("Job bill"),
      }),
    );
  });

  it("keeps unfinished QC out of the branch-scoped billable job selector", async () => {
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([]);
    await new JobBillingService().listBillableJobCards("branch");
    expect(prisma.jobCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: "branch",
          billedAt: null,
          qcStatus: { equals: "PASSED", mode: "insensitive" },
        }),
      }),
    );
  });

  it("consolidates every ready vehicle job into one Warranty invoice under shared locks", async () => {
    const first = {
      ...card,
      id: "job",
      jobNumber: "J1",
      vehicleId: "vehicle",
      status: "READY",
      deliveredAt: null,
    };
    const second = { ...first, id: "job2", jobNumber: "J2" };
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(first);
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([first, second]);
    await new JobBillingService().createJobBill({
      ...input,
      consolidateVehicle: true,
    });
    expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billType: "WARRANTY",
          labourTotal: 200,
          total: 210,
          jobCards: { connect: [{ id: "job" }, { id: "job2" }] },
        }),
      }),
    );
    expect(prisma.jobCard.update).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
  });

  it.each(["PENDING", "FAILED", null])(
    "rejects stale READY QC %s in preview and creation before any invoice write",
    async (qcStatus) => {
      (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
        ...card,
        status: "READY",
        qcStatus,
      });
      const service = new JobBillingService();
      await expect(service.previewJobBill(input)).rejects.toThrow(
        "passed quality check",
      );
      await expect(service.createJobBill(input)).rejects.toThrow(
        "passed quality check",
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
      expect(prisma.jobCard.update).not.toHaveBeenCalled();
    },
  );

  it("rechecks every consolidated member and rejects pending QC atomically", async () => {
    const first = {
      ...card,
      vehicleId: "vehicle",
      status: "READY",
      jobNumber: "J1",
    };
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(first);
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([
      first,
      { ...first, id: "job2", qcStatus: "FAILED" },
    ]);
    await expect(
      new JobBillingService().createJobBill({
        ...input,
        consolidateVehicle: true,
      }),
    ).rejects.toThrow("passed quality check");
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  });

  it("does not trust an earlier successful preview after QC changes", async () => {
    const first = { ...card, status: "READY" };
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(first);
    const service = new JobBillingService();
    expect((await service.previewJobBill(input)).review.canBill).toBe(true);
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...first,
      qcStatus: "PENDING",
    });
    await expect(service.createJobBill(input)).rejects.toThrow(
      "passed quality check",
    );
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  });

  it("aggregates review totals from every consolidated job and reports a failing member", async () => {
    const first = {
      ...card,
      vehicleId: "vehicle",
      status: "READY",
      jobNumber: "J1",
    };
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(first);
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([
      first,
      { ...first, id: "job2", jobNumber: "J2" },
    ]);
    const service = new JobBillingService();
    const preview = await service.previewJobBill({
      ...input,
      consolidateVehicle: true,
    });
    expect(preview.review).toMatchObject({
      canBill: true,
      approvedSubtotal: 600,
      actualSubtotal: 200,
    });
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([
      first,
      { ...first, id: "job2", jobNumber: "J2", estimates: [] },
    ]);
    const blocked = await service.previewJobBill({
      ...input,
      consolidateVehicle: true,
    });
    expect(blocked.review.canBill).toBe(false);
    expect(blocked.review.status).not.toBe("Approved");
    expect(blocked.review.issues.some((issue) => issue.startsWith("J2:"))).toBe(
      true,
    );
  });
  it("refuses mixed customers or unfinished work instead of partially billing a vehicle", async () => {
    const first = {
      ...card,
      id: "job",
      jobNumber: "J1",
      vehicleId: "vehicle",
      status: "READY",
      deliveredAt: null,
    };
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(first);
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([
      first,
      { ...first, id: "job2", customerId: "other" },
    ]);
    await expect(
      new JobBillingService().createJobBill({
        ...input,
        consolidateVehicle: true,
      }),
    ).rejects.toThrow("same branch and bill-to customer");
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([
      first,
      { ...first, id: "job2", status: "IN_PROGRESS" },
    ]);
    await expect(
      new JobBillingService().createJobBill({
        ...input,
        consolidateVehicle: true,
      }),
    ).rejects.toThrow("Only ready");
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
  it("rejects repeat billing of the selected job", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      billedAt: new Date(),
    });
    await expect(
      new JobBillingService().createJobBill({
        ...input,
        consolidateVehicle: true,
      }),
    ).rejects.toThrow("active bill");
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it.each([
    { governmentVehicle: false, partsVat: 15, rate: 7.5, total: 320, roundOff: -2.5 },
    { governmentVehicle: true, partsVat: 0, rate: 0, total: 300, roundOff: -7.5 },
  ])("persists the enabled VAT breakdown (government vehicle: $governmentVehicle)", async ({ governmentVehicle, partsVat, rate, total, roundOff }) => {
    (prisma.financeSetting.findUnique as jest.Mock).mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve({
          value:
            where.key === "JOB_BILL_PARTS_VAT_ENABLED"
              ? true
              : where.key === "partsVatRates"
                ? { SPARES: 7.5, OIL: 7.5, ACCESSORIES: 7.5 }
                : 30,
        }),
    );
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      customer: { governmentVehicle },
      partIssuances: [
        {
          id: "issue",
          sparePartId: "part",
          quantity: 2,
          returns: [],
          jobCardLine: { id: "line", chargeType: "CUSTOMER" },
          sparePart: {
            partNumber: "P",
            name: "Filter",
            retailRate: 100,
            taxCategory: "A",
            taxable: true,
          },
        },
      ],
      estimates: [
        {
          ...approved,
          amount: 500,
          lines: [
            ...approved.lines,
            {
              type: "PART",
              referenceId: "part",
              description: "Filter",
              quantity: 2,
              rate: 100,
              amount: 200,
            },
          ],
        },
      ],
    });
    const service = new JobBillingService();
    const preview = await service.previewJobBill(input);
    await service.createJobBill(input);
    const data = (prisma.invoice.create as jest.Mock).mock.calls[0][0].data;
    expect(data.vatBreakdown.create).toEqual(preview.vatBreakdown);
    expect(data.total).toBe(preview.totals.total);
    expect(data.vatBreakdown.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "SPARES",
          rate,
          saleAmount: 200,
          discount: 0,
          taxableAmount: 200,
          vat: partsVat,
        }),
      ]),
    );
    expect(data.vatAmount).toBe(partsVat + 7.5);
    expect(data.total).toBe(total);
    expect(data.roundOff).toBe(roundOff);
    expect(data.taxRegisterSnapshot.source).toBe("BILLING");
  });

  it("snapshots the named service charge exactly once alongside labour", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      service: { name: "Full service" },
      serviceCharge: 200,
    });
    const preview = await new JobBillingService().previewJobBill(input);
    await new JobBillingService().createJobBill(input);
    const data = (prisma.invoice.create as jest.Mock).mock.calls[0][0].data;
    expect(preview.lines.filter((line) => line.type === "SERVICE")).toEqual([
      expect.objectContaining({
        description: "Full service ? service charge",
        amount: 200,
        quantity: 1,
      }),
    ]);
    expect(data.serviceTotal).toBe(200);
    expect(data.total).toBe(preview.totals.total);
    expect(
      data.lines.createMany.data.filter(
        (line: { type: string }) => line.type === "SERVICE",
      ),
    ).toHaveLength(1);
  });

  it("bills the workshop-only service charge using its approved type reference", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      serviceId: null,
      serviceTypeId: "service-type",
      serviceType: { description: "PAID SERVICE", chargedTo: "CUSTOMER" },
      serviceCharge: 15100,
      estimates: [
        {
          ...approved,
          lines: [
            approved.lines[0],
            {
              type: "SERVICE",
              referenceId: "service-type",
              description: "PAID SERVICE",
              quantity: 1,
              rate: 15100,
              amount: 15100,
            },
          ],
        },
      ],
    });
    const preview = await new JobBillingService().previewJobBill(input);
    expect(preview.lines.filter((line) => line.type === "SERVICE")).toEqual([
      expect.objectContaining({
        referenceId: "service-type",
        description: "PAID SERVICE",
        amount: 15100,
      }),
    ]);
    await new JobBillingService().createJobBill(input);
    expect(prisma.invoice.create).toHaveBeenCalled();
  });

  it("keeps an explicitly waived service visible without adding a charge", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      service: { name: "Full service" },
      serviceCharge: 0,
    });
    const preview = await new JobBillingService().previewJobBill(input);
    expect(preview.lines).toContainEqual(
      expect.objectContaining({ type: "SERVICE", amount: 0 }),
    );
    expect(preview.totals.serviceTotal).toBe(0);
  });

  it("blocks billing when the latest estimate is not approved", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      estimates: [{ ...approved, status: "Pending", approvals: [] }],
    });
    const preview = await new JobBillingService().previewJobBill(input);
    expect(preview.review.canBill).toBe(false);
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow(
      "latest estimate",
    );
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("saves included labour at zero additional charge and charges the service once", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      serviceCharge: 200,
      estimates: [
        {
          ...approved,
          lines: approved.lines.map((line) =>
            line.type === "LABOUR"
              ? { ...line, type: "INCLUDED_LABOUR", rate: 0, amount: 0 }
              : line,
          ),
        },
      ],
    });
    await new JobBillingService().createJobBill(input);
    const data = (prisma.invoice.create as jest.Mock).mock.calls[0][0].data;
    expect(data.serviceTotal).toBe(200);
    expect(data.labourTotal).toBe(0);
    expect(data.lines.createMany.data).toContainEqual(
      expect.objectContaining({
        type: "LABOUR",
        amount: 0,
        rate: 0,
        description: "Repair (included in service charge)",
      }),
    );
  });

  it("rejects delivered jobs without credit approval", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      creditApprovedById: null,
    });
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow(
      "approved credit",
    );
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("prevents a second active bill after delivery", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      invoices: [{ status: "Unpaid" }],
    });
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow(
      "active bill",
    );
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("keeps normal READY billing on the BILLED lifecycle step", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      ...card,
      status: "READY",
      creditApprovedById: null,
    });
    await new JobBillingService().createJobBill(input);
    expect(prisma.jobCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "BILLED" }),
      }),
    );
  });
});

const prismaFailure = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("database failure", {
    code,
    clientVersion: "6.16.2",
  });

describe("Job-bill transaction resilience", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.customer.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      creditDays: null,
    });
    (prisma.financeSetting.findUnique as jest.Mock).mockResolvedValue({
      value: 30,
    });
    (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
      callback(prisma),
    );
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(card);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "advisor",
      role: { name: ROLES.SERVICE_ADVISOR },
      isActive: true,
      branchId: "branch",
    });
    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({
      value: 1,
    });
    (prisma.customer.findUnique as jest.Mock).mockResolvedValue({
      id: "customer",
    });
    (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.invoice.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: "invoice", ...data }),
    );
    (prisma.invoice.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: "invoice", ...data }),
    );
  });

  it("uses customer terms before the company default", async () => {
    (prisma.customer.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      creditDays: 0,
    });
    await new JobBillingService().createJobBill(input);
    const data = (prisma.invoice.create as jest.Mock).mock.calls[0][0].data;
    expect(data.dueDate).toBeInstanceOf(Date);
    expect(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
        data.dueDate,
      ),
    ).toBe(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
        data.issuedDate,
      ),
    );
    expect(prisma.financeSetting.findUnique).not.toHaveBeenCalledWith({
      where: { key: "defaultCreditDays" },
    });
  });
  it("uses bounded transaction limits and bulk inserts line snapshots", async () => {
    await new JobBillingService().createJobBill(input);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 15000,
    });
    expect(
      (prisma.invoice.create as jest.Mock).mock.calls[0][0].data.lines,
    ).toEqual({
      createMany: {
        data: [expect.objectContaining({ type: "LABOUR", amount: 100 })],
      },
    });
    expect(
      (prisma.jobCard.findUnique as jest.Mock).mock.calls[1][0].include
        .labourLines,
    ).toEqual({
      include: {
        chargeLine: {
          select: {
            id: true,
            chargeType: true,
            quantity: true,
            rate: true,
            amount: true,
          },
        },
      },
    });
  });

  it("retries an aborted serialization conflict", async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      prismaFailure("P2034"),
    );
    await expect(
      new JobBillingService().createJobBill(input),
    ).resolves.toMatchObject({ id: "invoice" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("stops after three conflicting attempts", async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      prismaFailure("P2034"),
    );
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow(
      "changed during billing",
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each(["P2028", "P2024"])(
    "does not replay %s and provides a recoverable error",
    async (code) => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(prismaFailure(code));
      await expect(
        new JobBillingService().createJobBill(input),
      ).rejects.toMatchObject({ statusCode: 503 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry a duplicate bill", async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(
      prismaFailure("P2002"),
    );
    await expect(new JobBillingService().createJobBill(input)).rejects.toThrow(
      "already been billed",
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
