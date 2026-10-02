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
      update: jest.fn(),
    },

    user: {
      findFirst: jest.fn(),
    },

    workshopMaster: {
      findFirst: jest.fn(),
    },

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
      create: jest.fn(),
    },

    $queryRaw: jest.fn(),

    jobCardStatusHistory: {
      create: jest.fn(),
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
} from "./job-card-workflow.service";
const id = "00000000-0000-4000-8000-000000000001";

const input = {
  branchName: "Test",
  description: "Repair",
  customerId: id,
  vehicleId: id,
  serviceId: id,
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
      customerId: "different-owner",
      lastRecordedMileage: 90,
    });

    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id,
    });

    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id,
    });

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
    "serviceId",
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

  it("opens a job card without a service type master", async () => {
    await new ServiceService().createJobCard({ ...input, createdById: id });

    expect(prisma.workshopMaster.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: "SERVICE_TYPE" }),
      }),
    );
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

    await new ServiceService().addEstimate(id, {
      description: "Workshop estimate",
      lines: [{ type: "SERVICE", referenceId: id, quantity: 1 }],
    });

    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: { id, isActive: true },
    });
    expect(prisma.estimate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 85000,
          lines: {
            create: [
              expect.objectContaining({
                type: "SERVICE",
                description: "Full Service",
                rate: 85000,
                amount: 85000,
              }),
            ],
          },
        }),
      }),
    );
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
