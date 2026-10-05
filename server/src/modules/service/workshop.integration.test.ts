// Run only against a migrated, disposable database explicitly supplied by the caller.
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

jest.mock("../notification/notification.service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifyRole: jest.fn(),
    notifyUsers: jest.fn(),
  })),
}));

import { ReceiptService } from '../finance/receipt.service';
import { WorkshopService } from '../workshop/workshop.service';
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ServiceService } from "./service.service";
import { LabourService } from "./labour.service";
import { VehicleService } from "../vehicle/vehicle.service";
import { CustomerService } from "../customer/customer.service";
import { InventoryService } from "../inventory/inventory.service";
import { JobBillingService } from "../finance/job-billing.service";
import { ROLES } from "../../shared/constants/roles";
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration("Workshop database flow", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("opens from an appointment, records labour/parts, bills, delivers, changes owner and merges atomically", async () => {
    const rollback = new Error("ROLLBACK_TEST_FIXTURES");
    const originalTransaction = prisma.$transaction.bind(prisma);

    await expect(
      originalTransaction(
        async (tx) => {
          const suffix = randomUUID();

          const branch = await tx.branch.create({
            data: {
              name: `workshop-${suffix}`,
            },
          });

          const role = await tx.role.upsert({
            where: {
              name: ROLES.SERVICE_ADVISOR,
            },

            update: {},

            create: {
              name: ROLES.SERVICE_ADVISOR,
            },
          });

          const user = await tx.user.create({
            data: {
              email: `${suffix}@example.test`,
              firstName: "Test",
              lastName: "Advisor",
              passwordHash: "not-a-login",
              roleId: role.id,
              branchId: branch.id,
            },
          });

          const customer = await tx.customer.create({
            data: {
              firstName: "Test",
              lastName: "Owner",
              phoneNumber: suffix,
              branchId: branch.id,
            },
          });

          const duplicate = await tx.customer.create({
            data: {
              firstName: "Test",
              lastName: "Duplicate",
              branchId: branch.id,
            },
          });

          const vehicle = await tx.vehicle.create({
            data: {
              vin: suffix,
              customModel: "Integration fixture",
              customerId: customer.id,
              lastRecordedMileage: 100,
            },
          });

          const appointment = await tx.serviceAppointment.create({
            data: {
              customerId: customer.id,
              vehicleId: vehicle.id,
              branchId: branch.id,
              scheduledAt: new Date(),
            },
          });

          const master = (kind: string) =>
            tx.workshopMaster.create({
              data: {
                kind,
                code: suffix,
                description: kind,
              },
            });

          const bay = await master("BAY");
          const team = await master("TEAM");
          const late = await master("LATE_REASON");
          const catalogService = await tx.service.create({
            data: { name: `Test service ${suffix}`, price: 1000 },
          });

          const part = await tx.sparePart.create({
            data: {
              partNumber: suffix,
              name: "Test part",
              unitPrice: 1000,
              retailRate: 1000,
            },
          });

          await tx.inventoryStock.create({
            data: {
              branchId: branch.id,
              partId: part.id,
              quantity: 5,
            },
          });

          const operation = await tx.labourItem.create({
            data: {
              code: suffix,
              description: "Test labour",
              defaultHours: 1,
              rate: 1000,
            },
          });

          // Reuse this transaction for service calls so fixtures and assertions roll back together.
          const transactionSpy = jest
            .spyOn(prisma, "$transaction")
            .mockImplementation(((
              callback: (client: Prisma.TransactionClient) => Promise<unknown>,
            ) => callback(tx)) as typeof prisma.$transaction);

          try {
            const jobs = new ServiceService();

            const job = await jobs.createJobCard({
              appointmentId: appointment.id,
              customerId: customer.id,
              vehicleId: vehicle.id,
              serviceId: catalogService.id,
              branchName: branch.name,
              description: "Inspection",
              bayId: bay.id,
              teamId: team.id,
              serviceAdvisorId: user.id,
              mileage: 150,
              promisedAt: new Date(Date.now() - 60000).toISOString(),

              complaints: [
                {
                  description: "Brake noise",
                },
              ],

              createdById: user.id,
            });

            expect(job.jobNumber).toMatch(/^\d{10}$/);

            const estimate = await jobs.addEstimate(job.id, { description: 'Approved scope', lines: [
              { type: 'SERVICE', referenceId: catalogService.id, quantity: 1 },
              { type: 'PART', referenceId: part.id, quantity: 2 },
              { type: 'LABOUR', referenceId: operation.id, quantity: 1 },
            ] });
            await jobs.addApproval(estimate.id, { customerId: customer.id, approved: true });
            await new LabourService().addJobCardLine(job.id, {
              labourItemId: operation.id,
            });

            const issuance = await new InventoryService().createPartIssuance({
              branchId: branch.id,
              sparePartId: part.id,
              jobCardId: job.id,
              issuedById: user.id,
              quantity: 2,
            });

            await new InventoryService().createPartReturn({
              branchId: branch.id,
              partIssuanceId: issuance.id,
              returnedById: user.id,
              quantity: 1,
            });

            await jobs.updateJobCard(
              job.id,
              {
                status: "IN_PROGRESS",
              },
              user.id,
            );

            await jobs.updateJobCard(
              job.id,
              {
                status: "QC",
              },
              user.id,
            );

            await new WorkshopService().updateQC(job.id, "PASSED", "Checked");
            await jobs.updateJobCard(
              job.id,
              {
                status: "READY",
              },
              user.id,
            );

            const bill = await new JobBillingService().createJobBill({
              jobCardId: job.id,
              partsDiscountPercent: 0,
              labourDiscountPercent: 0,
              serviceAdvisorId: user.id,
              actorId: user.id,
            });

            expect(bill.lines).toHaveLength(3);
            await new ReceiptService().createReceipt({ customerId: customer.id, branchId: branch.id, issuedById: user.id, mode: 'CASH', category: 'SERVICE_PARTS', amount: bill.total, allocations: [{ invoiceId: bill.id, amount: bill.total }] });

            await expect(
              jobs.updateJobCard(
                job.id,
                {
                  status: "DELIVERED",
                  deliveryAdvisorId: user.id,
                },
                user.id,
              ),
            ).rejects.toThrow("Late delivery");

            const delivered = await jobs.updateJobCard(
              job.id,
              {
                status: "DELIVERED",
                deliveryAdvisorId: user.id,
                lateReasonIds: [late.id],
              },
              user.id,
            );

            expect(delivered.gatePassNumber).toMatch(/^\d{10}$/);

            expect(
              await tx.jobCardStatusHistory.count({
                where: {
                  jobCardId: job.id,
                },
              }),
            ).toBe(6);

            await new VehicleService().addVehicleOwnership(vehicle.id, {
              customerId: duplicate.id,
              purchaseDate: new Date().toISOString(),
            });

            expect(
              await tx.vehicleOwnership.count({
                where: {
                  vehicleId: vehicle.id,
                },
              }),
            ).toBe(2);

            await new CustomerService().merge(
              customer.id,
              duplicate.id,
              user.id,
            );

            expect(
              (
                await tx.invoice.findUniqueOrThrow({
                  where: {
                    id: bill.id,
                  },
                })
              ).customerId,
            ).toBe(duplicate.id);

            expect(
              (
                await tx.jobCard.findUniqueOrThrow({
                  where: {
                    id: job.id,
                  },
                })
              ).customerId,
            ).toBe(duplicate.id);
          } finally {
            transactionSpy.mockRestore();
          }

          throw rollback;
        },
        {
          timeout: 30000,
        },
      ),
    ).rejects.toBe(rollback);
  }, 40000);
});
