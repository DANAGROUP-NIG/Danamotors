jest.mock("../../prisma/client", () => ({
  __esModule: true,

  default: {
    $transaction: jest.fn(),

    customer: {
      findFirst: jest.fn(),
    },

    vehicle: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },

    branch: {
      findFirst: jest.fn(),
    },

    jobCard: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },

    user: {
      findFirst: jest.fn(),
    },

    workshopMaster: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    warrantyDefectCode: { findMany: jest.fn().mockResolvedValue([]) },

    documentSequence: {
      upsert: jest.fn(),
    },

    serviceAppointment: {
      findUnique: jest.fn(),
    },

    service: {
      findFirst: jest.fn(),
    },

    estimate: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },

    $queryRaw: jest.fn(),

    jobCardStatusHistory: {
      create: jest.fn(),
    },

    // Warranty & campaign check on opening: no open campaigns for the test vehicle.
    campaignVehicle: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock("../notification/notification.service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifyRole: jest.fn(),
  })),
}));

import prisma from "../../prisma/client";
import { ServiceRepository } from "./service.repository";
import { ServiceService } from "./service.service";
import {
  createJobCardSchema,
  updateJobCardSchema,
  listJobCardsSchema,
} from "./service.validation";
import {
  assertTransition,
  repeatWindowStart,
  jobStatusFilter,
} from "./job-card-workflow.service";
const id = "00000000-0000-4000-8000-000000000001";

const input = {
  branchName: "Test",
  description: "Repair",
  customerId: id,
  vehicleId: id,
  serviceId: id,
  serviceTypeId: id,
  bayId: id,
  serviceAdvisorId: id,
  technicianId: id,
  mileage: 100,
  promisedAt: "2026-10-01T12:00:00.000Z",

  complaints: [
    {
      description: "Brake noise",
    },
  ],
};

describe("JobCard workflow", () => {
  it("includes legacy and canonical statuses in the same lifecycle filter", () => {
    expect(jobStatusFilter("READY")).toEqual({ in: ["READY", "Ready", "Completed"] });
    expect(jobStatusFilter("Closed")).toEqual({ in: ["DELIVERED", "Closed"] });
  });
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
      callback(prisma),
    );

    (prisma.branch.findFirst as jest.Mock).mockResolvedValue({
      id,
      name: "Test",
    });

    (prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
      id,
      vin: "KNAPU81BDP7123456",
      customerId: "different-owner",
      lastRecordedMileage: 90,
      saleDate: null,
      vehicleModel: null,
    });

    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id,
    });

    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id,
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{
      vehicleId: id, modelId: id, id, code: 'RG', description: 'PAID SERVICE',
      chargedTo: 'CUSTOMER', displayOrder: null, serviceCharge: 15100,
      previousCharge: 12800, effectiveFrom: new Date('2022-04-20T00:00:00Z'),
    }]);

    (prisma.workshopMaster.findFirst as jest.Mock).mockResolvedValue({
      id,
      description: "Master",
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id,
    });

    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({
      value: 2,
    });

    (prisma.jobCard.create as jest.Mock).mockResolvedValue({
      id,
    });
  });

  it.each([
    "customerId",
    "vehicleId",
    "serviceTypeId",
    "bayId",
    "serviceAdvisorId",
    "mileage",
    "promisedAt",
    "complaints",
  ])("requires %s at opening", (field) => {
    const body: Record<string, unknown> = {
      ...input,
    };

    delete body[field];

    expect(
      createJobCardSchema.safeParse({
        body,
      }).success,
    ).toBe(false);
  });

  it("snapshots the model service-type charge instead of the appointment catalogue price", async () => {
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({ id, price: 85000 });
    await new ServiceService().createJobCard({ ...input, createdById: id });
    expect(prisma.jobCard.create).toHaveBeenCalledWith({ data: expect.objectContaining({ serviceCharge: 15100 }) });
  });

  it("preserves an explicitly waived service charge", async () => {
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({ id, price: 85000 });
    await new ServiceService().createJobCard({ ...input, serviceCharge: 0, createdById: id });
    expect(prisma.jobCard.create).toHaveBeenCalledWith({ data: expect.objectContaining({ serviceCharge: 0 }) });
  });

  it("opens a job card without an appointment catalogue service", async () => {
    await new ServiceService().createJobCard({ ...input, serviceId: undefined, createdById: id });

    expect(prisma.service.findFirst).not.toHaveBeenCalled();
    expect(prisma.jobCard.create).toHaveBeenCalledWith({ data: expect.objectContaining({ serviceTypeId: id }) });
  });
  it("rejects an unavailable service type before creating the card", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ vehicleId: id, modelId: id, id: null }]);
    await expect(new ServiceService().createJobCard({ ...input, createdById: id }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Service type not available for this vehicle model' });
    expect(prisma.jobCard.create).not.toHaveBeenCalled();
  });

  it("rejects raw job numbers, lifecycle overrides, empty complaints and unassigned jobs", () => {
    for (const body of [
      {
        ...input,
        jobNumber: "manual",
      },
      {
        ...input,
        status: "READY",
      },
      {
        ...input,
        complaints: [],
      },
      {
        ...input,

        complaints: [
          {
            description: " ",
          },
        ],
      },
      {
        ...input,
        technicianId: undefined,
      },
    ])
      expect(
        createJobCardSchema.safeParse({
          body,
        }).success,
      ).toBe(false);
  });

  it("allows a bill-to customer different from the owner and generates the number transactionally", async () => {
    await new ServiceService().createJobCard({
      ...input,
      createdById: id,
    });

    expect(prisma.jobCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: id,
        serviceId: id,
        status: "OPEN",
        jobNumber: expect.stringMatching(/^\d{4}000002$/),

        statusHistory: {
          create: {
            toStatus: "OPEN",
            actorId: id,
          },
        },
      }),
    });

    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: {
        id,
      },

      data: {
        lastRecordedMileage: 100,
        lastMileageAt: expect.any(Date),
      },
    });
  });

  it("prices estimate service lines from active catalog services", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      id,
      billedAt: null,
      status: "OPEN",
      vehicle: null,
    });
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id,
      name: "Full Service",
      price: 85000,
      isActive: true,
    });
    (prisma.estimate.create as jest.Mock).mockResolvedValue({ id });
    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({ value: 7 });

    await new ServiceService().addEstimate(id, {
      description: "Workshop estimate",
      lines: [{ type: "SERVICE", referenceId: id, quantity: 1 }],
    });

    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: { id, isActive: true },
    });
    // Earlier revisions are superseded and the new one is numbered.
    expect(prisma.estimate.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ jobCardId: id }), data: { estimateStatus: "CLOSED", closedReason: "SUPERSEDED" } }));
    expect(prisma.estimate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estimateNumber: expect.stringMatching(/^\d{4}000007$/),
          estimateStatus: "PENDING_APPROVAL",
          amount: 85000,
          lines: {
            createMany: { data: [
              expect.objectContaining({
                type: "SERVICE",
                description: "Full Service",
                rate: 85000,
                amount: 85000,
              }),
            ] },
          },
        }),
      }),
    );
  });

  it("carries a workshop-only service charge into the approved estimate without a catalogue lookup", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      id, status: 'OPEN', vehicle: null, serviceId: null, serviceTypeId: id,
      serviceType: { description: 'PAID SERVICE' }, serviceCharge: 15100,
    });
    await new ServiceService().addEstimate(id, {
      description: 'Model charge', lines: [{ type: 'SERVICE', referenceId: id, quantity: 1 }],
    });
    expect(prisma.service.findFirst).not.toHaveBeenCalled();
    expect(prisma.estimate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      amount: 15100, lines: { createMany: { data: [expect.objectContaining({
        type: 'SERVICE', referenceId: id, description: 'PAID SERVICE', amount: 15100,
      })] } },
    }) }));
  });

  it("calculates the opening estimate from its breakdown and persists the checklist", async () => {
    await new ServiceService().createJobCard({
      ...input,
      createdById: id,
      estimatedParts: 10.1,
      estimatedOil: 0.2,
      estimatedLabour: 50,
      serviceCharge: 5,
      estimatedCost: 9999,
      checklist: "Inspect brakes and tyres",
    });
    expect(prisma.jobCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        estimatedCost: 65.3,
        checklist: "Inspect brakes and tyres",
        estimatedParts: 10.1,
      }),
    });
  });

  it.each([-1, 0.001, Infinity, 1e13])(
    "rejects an invalid estimate amount: %s",
    (amount) => {
      expect(
        createJobCardSchema.safeParse({
          body: { ...input, estimatedOil: amount },
        }).success,
      ).toBe(false);
    },
  );

  it("uses request amounts as the authoritative opening estimate and snapshots other details", async () => {
    await new ServiceService().createJobCard({
      ...input,
      createdById: id,
      estimatedParts: 9999,
      serviceCharge: 5,
      complaints: [
        {
          defectCode: "9999999",
          description: "Brake noise",
          spare: 10.1,
          oil: 0.2,
          labour: 50,
        },
      ],
      tyres: Array.from({ length: 5 }, () => ({
        makeId: id,
        number: "tyre-1",
      })),
      batteryMakeId: id,
      batteryNumber: "bat-2",
      customField1: "Reference",
      acType: "DEALER",
    });
    expect(prisma.jobCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        estimatedParts: 10.1,
        estimatedOil: 0.2,
        estimatedLabour: 50,
        estimatedCost: 65.3,
        tyres: expect.arrayContaining([
          { makeId: id, make: "Master", number: "TYRE-1" },
        ]),
        batteryMake: "Master",
        batteryNumber: "BAT-2",
        customField1: "Reference",
        acFitted: true,
        complaints: {
          create: [
            expect.objectContaining({
              defectCode: "9999999",
              spare: 10.1,
              oil: 0.2,
              labour: 50,
            }),
          ],
        },
      }),
    });
  });

  it("rejects malformed tyre arrays, negative request costs and unknown accessory fields", () => {
    for (const extra of [
      { tyres: [] },
      { complaints: [{ description: "Repair", spare: -1 }] },
      { tyres: Array.from({ length: 5 }, () => ({ unsupported: true })) },
    ]) {
      expect(
        createJobCardSchema.safeParse({ body: { ...input, ...extra } }).success,
      ).toBe(false);
    }
  });

  it("rejects decreasing mileage without opening a card", async () => {
    await expect(
      new ServiceService().createJobCard({
        ...input,
        mileage: 80,
        createdById: id,
      }),
    ).rejects.toThrow("Mileage");

    expect(prisma.jobCard.create).not.toHaveBeenCalled();
  });

  it("rejects appointments from another branch", async () => {
    (prisma.serviceAppointment.findUnique as jest.Mock).mockResolvedValue({
      branchId: "other",
      vehicleId: id,
    });

    await expect(
      new ServiceService().createJobCard({
        ...input,
        appointmentId: id,
        createdById: id,
      }),
    ).rejects.toThrow("branch");
  });

  it("requires previous job and reason for repeats", () => {
    expect(
      createJobCardSchema.safeParse({
        body: {
          ...input,
          isRepeat: true,
        },
      }).success,
    ).toBe(false);

    expect(
      repeatWindowStart(new Date("2026-10-01T00:00:00Z"), 30).toISOString(),
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  it("enforces transitions, cancellation reasons and late delivery reasons", () => {
    const now = new Date("2026-10-02T00:00:00Z");

    const context = {
      promisedAt: new Date("2026-10-01T00:00:00Z"),
    };

    expect(() => assertTransition("OPEN", "READY", context, now)).toThrow(
      "Cannot move",
    );

    expect(() =>
      assertTransition(
        "BILLED",
        "CANCELLED",
        {
          ...context,
          remarks: "reason",
        },
        now,
      ),
    ).toThrow("Cannot move");

    expect(() => assertTransition("OPEN", "CANCELLED", context, now)).toThrow(
      "reason",
    );
    expect(() => assertTransition("BILLED", "DELIVERED", context, now)).toThrow(
      "Late delivery",
    );

    expect(() =>
      assertTransition(
        "BILLED",
        "DELIVERED",
        {
          ...context,
          lateReasonIds: [id],
        },
        now,
      ),
    ).not.toThrow();

    expect(() =>
      assertTransition("BILLED", "DELIVERED", context, context.promisedAt),
    ).not.toThrow();
    expect(() =>
      assertTransition("DELIVERED", "DELIVERED", context, now),
    ).toThrow();
  });

  it("blocks edits to a billed card and prevents client-set gate passes", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      billedAt: new Date(),
      status: "BILLED",
      invoices: [],
    });

    await expect(
      new ServiceService().updateJobCard(
        id,
        {
          observations: "changed",
        },
        id,
      ),
    ).rejects.toThrow("Billed");

    expect(
      updateJobCardSchema.safeParse({
        params: {
          id,
        },

        body: {
          gatePassNumber: "forged",
        },
      }).success,
    ).toBe(false);
  });

  it("counts records through the end of the selected day", async () => {
    jest
      .spyOn(ServiceRepository.prototype, "listJobCards")
      .mockResolvedValue([]);
    (prisma.jobCard.count as jest.Mock).mockResolvedValue(0);

    await new ServiceService().listJobCards({
      dateTo: "2026-09-28",
    });

    expect(prisma.jobCard.count).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lte: new Date("2026-09-28T23:59:59.999Z"),
        },
      },
    });
  });

  it("treats a legacy billed status as locked even without billedAt", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ status: "Billed", billedAt: null, invoices: [] });
    await expect(new ServiceService().updateJobCard(id, { observations: "changed" }, id)).rejects.toThrow("Billed");
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  });

  it("delivers an approved-credit job with a gate pass and recorded late reason", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
      id, branchId: id, status: "READY", billedAt: null, invoices: [], creditApprovedById: id,
      promisedAt: new Date("2020-01-01T00:00:00Z"),
    });
    (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id, customerId: id, partIssuances: [], labourLines: [] });
    (prisma.estimate.findMany as jest.Mock).mockResolvedValue([{ id, status: 'Approved', amount: 0, lines: [], approvals: [{ approved: true, customerId: id }] }]);
    (prisma.jobCard.update as jest.Mock).mockResolvedValue({ id, status: "DELIVERED" });
    await new ServiceService().updateJobCard(id, { status: "DELIVERED", deliveryAdvisorId: id, lateReasonIds: [id], remarks: "Customer collected" }, id);
    expect(prisma.jobCard.update).toHaveBeenCalledWith({ where: { id }, data: expect.objectContaining({
      status: "DELIVERED", deliveredAt: expect.any(Date), deliveryAdvisorId: id, lateReasonIds: [id], gatePassNumber: expect.any(String),
    }) });
    expect(prisma.jobCardStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromStatus: "READY", toStatus: "DELIVERED", actorId: id, remarks: "Customer collected" }) });
  });

  it("rejects delivery before billing or credit approval without issuing a gate pass", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, branchId: id, status: "READY", billedAt: null, invoices: [], promisedAt: new Date("2099-01-01T00:00:00Z") });
    await expect(new ServiceService().updateJobCard(id, { status: "DELIVERED", deliveryAdvisorId: id }, id)).rejects.toThrow("bill or approved credit");
    expect(prisma.documentSequence.upsert).not.toHaveBeenCalled();
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  });

  it("blocks delivery of an unpaid bill without explicit credit approval", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, branchId: id, status: 'BILLED', billedAt: new Date(), invoices: [{ status: 'Unpaid', outstandingAmount: 100 }], promisedAt: new Date('2099-01-01') });
    await expect(new ServiceService().updateJobCard(id, { status: 'DELIVERED', deliveryAdvisorId: id }, id)).rejects.toThrow('fully paid');
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  });

  it("blocks work before approval and readiness before a passed QC", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, customerId: id, status: 'OPEN', invoices: [] });
    (prisma.estimate.findMany as jest.Mock).mockResolvedValue([]);
    await expect(new ServiceService().updateJobCard(id, { status: 'IN_PROGRESS' }, id)).rejects.toThrow('approval');
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ id, customerId: id, status: 'QC', qcStatus: 'FAILED', invoices: [] });
    (prisma.estimate.findMany as jest.Mock).mockResolvedValue([{ id, status: 'Approved', amount: 0, lines: [], approvals: [{ approved: true, customerId: id }] }]);
    await expect(new ServiceService().updateJobCard(id, { status: 'READY' }, id)).rejects.toThrow('passed quality check');
    expect(prisma.jobCard.update).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination and dates", () => {
    for (const query of [
      {
        page: -1,
      },
      {
        limit: 0,
      },
      {
        dateFrom: "bad",
      },
      {
        dateFrom: "2026-09-29",
        dateTo: "2026-09-28",
      },
    ])
      expect(
        listJobCardsSchema.safeParse({
          query,
        }).success,
      ).toBe(false);
  });
});
