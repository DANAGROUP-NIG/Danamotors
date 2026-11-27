import { randomUUID } from "node:crypto";
import { once } from "node:events";
import bcrypt from "bcryptjs";

const testUrl = process.env.TEST_DATABASE_URL;
const localAcceptance =
  testUrl &&
  ["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname) &&
  new URL(testUrl).pathname === "/workflow_acceptance";
if (localAcceptance) process.env.DATABASE_URL = testUrl;

import prisma from "../../prisma/client";
import app from "../../app";
import seedPermissionsAndRoles from "../../../prisma/seed/roles";
import { ROLES } from "../../shared/constants/roles";
import { InventoryService } from "../inventory/inventory.service";
import { JobBillingService } from "../finance/job-billing.service";
import { FinanceService } from "../finance/finance.service";
import { PortalService } from "../customer-portal/portal.service";
import { ReceiptService } from "../finance/receipt.service";
import { RequisitionService } from "../requisition/requisition.service";
import { WorkshopService } from "../workshop/workshop.service";
import { drainJobcardNotifications } from "../notification/jobcard-notification-router";
import { estimateContentHash } from "./estimate-signature";
import { loadOpeningConsent } from "./job-opening-consent";
import {
  getSignedOpeningConsent,
  signJobOpening,
} from "./job-opening-signature.service";
import { requestJobcardParts } from "./jobcard-parts-request.service";
import {
  readServiceJobInspection,
  updateServiceJobInspection,
} from "./service-job-inspection";
import { ServiceService } from "./service.service";

const signatureImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const integration = localAcceptance ? describe : describe.skip;
jest.setTimeout(120_000);

integration("Strict service job acceptance against local PostgreSQL", () => {
  beforeAll(() => seedPermissionsAndRoles(prisma));
  afterAll(() => prisma.$disconnect());

  it.each(["direct", "requisition", "no-parts", "warranty-pricing"] as const)(
    "accepts a booked job through billing using %s",
    async (path) => {
      const needsParts = path !== "no-parts";
      const coveredPart = path === "warranty-pricing";
      const suffix = randomUUID();
      const adviserPassword = randomUUID();
      const branch = await prisma.branch.create({
        data: { name: `Workflow acceptance ${suffix}` },
      });
      const createStaff = async (role: string) => {
        const stored = await prisma.role.upsert({
          where: { name: role },
          create: { name: role },
          update: {},
        });
        return prisma.user.create({
          data: {
            email: `${role}-${suffix}@example.invalid`,
            firstName: role,
            lastName: "Fixture",
            branchId: branch.id,
            roleId: stored.id,
            passwordHash:
              role === ROLES.SERVICE_ADVISOR
                ? await bcrypt.hash(adviserPassword, 4)
                : "disabled-test-account",
          },
        });
      };
      const [
        adviser,
        technician,
        manager,
        store,
        qc,
        billing,
        warrantyOfficer,
      ] = await Promise.all(
        [
          ROLES.SERVICE_ADVISOR,
          ROLES.TECHNICIAN,
          ROLES.WORKSHOP_MANAGER,
          ROLES.BRANCH_STORE_MANAGER,
          ROLES.QC_OFFICER,
          ROLES.BILLING_OFFICER,
          ROLES.WARRANTY_OFFICER,
        ].map(createStaff),
      );
      const customer = await prisma.customer.create({
        data: {
          firstName: "Sample",
          lastName: "Customer",
          branchId: branch.id,
        },
      });
      const master = (kind: string) =>
        prisma.workshopMaster.create({
          data: { kind, code: suffix, description: kind },
        });
      const [model, bay, serviceType] = await Promise.all(
        ["MODEL", "BAY", "SERVICE_TYPE"].map(master),
      );
      await prisma.serviceTypeModelSetting.create({
        data: {
          serviceTypeId: serviceType.id,
          modelId: model.id,
          serviceCharge: 1000,
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          vin: suffix.replaceAll("-", "").slice(0, 17).toUpperCase(),
          registrationNumber: `QA-${suffix.slice(0, 8)}`,
          customModel: "Workflow fixture",
          catalogueId: model.id,
          customerId: customer.id,
        },
      });
      const appointment = await prisma.serviceAppointment.create({
        data: {
          customerId: customer.id,
          vehicleId: vehicle.id,
          branchId: branch.id,
          scheduledAt: new Date(),
        },
      });
      const part = await prisma.sparePart.create({
        data: {
          partNumber: suffix,
          name: "Fixture filter",
          unitPrice: 150,
          retailRate: 200,
        },
      });
      await prisma.inventoryStock.create({
        data: { partId: part.id, branchId: branch.id, quantity: 2 },
      });
      const terms = await loadOpeningConsent(prisma, appointment);
      const jobs = new ServiceService();
      const shop = new WorkshopService();
      const receipts = new ReceiptService();
      const opening = {
        appointmentId: appointment.id,
        customerId: customer.id,
        vehicleId: vehicle.id,
        branchName: branch.name,
        serviceTypeId: serviceType.id,
        bayId: bay.id,
        serviceAdvisorId: adviser.id,
        mileage: 10,
        description: "Check reported noise",
        promisedAt: new Date(Date.now() + 172800000).toISOString(),
        openingConsent: { accepted: true as const, termsHash: terms.termsHash },
        createdById: adviser.id,
        complaints: [{ description: "Reported noise" }],
      };
      await expect(jobs.createJobCard(opening)).rejects.toMatchObject({
        code: "FIELD_VALIDATION",
        details: { field: "faultVerification" },
      });
      const job = await jobs.createJobCard({
        ...opening,
        faultVerification: "Verified noise on inspection.",
      });
      const openingSignature = await getSignedOpeningConsent(job.id);
      await signJobOpening(
        job.id,
        {
          expectedHash: openingSignature.expectedHash,
          signatureImage,
          signerName: "Sample Customer",
          accepted: true,
          idempotencyKey: randomUUID(),
        },
        adviser.id,
      );
      await shop.assignTechnician(
        job.id,
        technician.id,
        undefined,
        adviser.id,
        0,
      );
      const inspection = await updateServiceJobInspection(
        job.id,
        branch.id,
        { userId: technician.id, role: ROLES.TECHNICIAN },
        {
          action: "submitInspection",
          version: 1,
          remarks: needsParts ? "Replace the filter." : "Adjust the bracket.",
          noPartsRequired: !needsParts,
          parts: needsParts ? [{ sparePartId: part.id, quantity: 2 }] : [],
        },
      );
      const warranty = await updateServiceJobInspection(
        job.id,
        branch.id,
        { userId: adviser.id, role: ROLES.SERVICE_ADVISOR },
        {
          action: "bypassWarranty",
          version: inspection.version,
        },
      );
      expect(warranty.stage).toBe("WARRANTY_RESOLVED");
      if (coveredPart) {
        // Model the future warranty integration's stored decision for this pricing test.
        await prisma.serviceJobWorkflow.update({
          where: { jobCardId: job.id },
          data: {
            warrantySource: "warranty_officer",
            warrantyResolvedById: warrantyOfficer.id,
            parts: {
              updateMany: {
                where: { sparePartId: part.id },
                data: { isUnderWarranty: true },
              },
            },
          },
        });
      }
      const estimateInput = {
        description: "Repair estimate",
        lines: [
          { type: "SERVICE", referenceId: serviceType.id, quantity: 1 },
          ...(needsParts
            ? [{ type: "PART" as const, referenceId: part.id, quantity: 2 }]
            : []),
        ],
      } as Parameters<ServiceService["addEstimate"]>[1];
      if (path === "direct") {
        const listener = app.listen(0, "127.0.0.1");
        await once(listener, "listening");
        try {
          const address = listener.address();
          if (!address || typeof address === "string")
            throw new Error("Local HTTP listener is unavailable");
          const base = `http://127.0.0.1:${address.port}/api`;
          const login = await fetch(`${base}/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: adviser.email,
              password: adviserPassword,
            }),
          });
          expect(login.status).toBe(200);
          const {
            data: { accessToken },
          } = (await login.json()) as { data: { accessToken: string } };
          const headers = {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          };
          const remarksUrl = `${base}/service/job-cards/${job.id}/remarks`;
          const remarks = await fetch(remarksUrl, { headers });
          const remarksResult: unknown = await remarks.json();
          expect({ statusCode: remarks.status, body: remarksResult }).toEqual(
            expect.objectContaining({
              statusCode: 200,
              body: expect.objectContaining({
                status: "success",
                data: { document: expect.objectContaining({ id: job.id }) },
              }),
            }),
          );
          const notes = {
            remarks: "Observed vibration near the café entrance.",
            customerRemarks: "Checked brackets at ₦0.00.",
          };
          const saved = await fetch(remarksUrl, {
            method: "PUT",
            headers,
            body: JSON.stringify(notes),
          });
          expect(await saved.json()).toMatchObject({
            status: "success",
            data: { document: notes },
          });
          expect(saved.status).toBe(200);
          const readback = await fetch(remarksUrl, { headers });
          expect(await readback.json()).toMatchObject({
            status: "success",
            data: { document: notes },
          });
          const consent = await fetch(
            `${base}/service/job-cards/${job.id}/opening-consent`,
            { headers },
          );
          expect(await consent.json()).toMatchObject({
            status: "success",
            data: { state: "signed" },
          });
          expect(consent.status).toBe(200);
          const created = await fetch(
            `${base}/service/job-cards/${job.id}/estimates`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(estimateInput),
            },
          );
          expect(await created.json()).toMatchObject({ status: "success" });
          expect(created.status).toBe(201);
        } finally {
          const closed = once(listener, "close");
          listener.close();
          listener.closeAllConnections();
          await closed;
        }
      } else {
        await jobs.addEstimate(job.id, estimateInput, adviser.id);
      }
      const estimate = await prisma.estimate.findFirstOrThrow({
        where: { jobCardId: job.id },
        include: { lines: true },
      });
      if (coveredPart) {
        expect(estimate.lines).toContainEqual(
          expect.objectContaining({
            referenceId: part.id,
            rate: 0,
            amount: 0,
            catalogueRate: 200,
            isUnderWarranty: true,
          }),
        );
      }
      await jobs.addApproval(
        estimate.id,
        {
          customerId: customer.id,
          approved: true,
          consentAccepted: true,
          expectedVersion: estimate.version,
          expectedHash: estimateContentHash(estimate),
          signerName: "Sample Customer",
          signatureImage,
        },
        adviser.id,
        { deviceOrIp: "local acceptance" },
      );
      await receipts.createReceipt({
        customerId: customer.id,
        branchId: branch.id,
        advanceJobCardId: job.id,
        issuedById: billing.id,
        mode: "CASH",
        category: "SERVICE_PARTS",
        amount: 500,
        allocations: [],
        idempotencyKey: randomUUID(),
      });
      const snapshot = async () => {
        const workflow = await readServiceJobInspection(job.id, branch.id, {
          userId: technician.id,
          role: ROLES.TECHNICIAN,
        });
        if (!workflow)
          throw new Error("Job was not enrolled in the strict workflow");
        return workflow;
      };
      await requestJobcardParts(
        job.id,
        branch.id,
        manager.id,
        randomUUID(),
        (await snapshot()).version,
      );
      if (needsParts) {
        const stock = new InventoryService();
        const requisitions = new RequisitionService();
        const issue = (requestId: string) =>
          path !== "requisition"
            ? stock.createPartIssuance({
                jobCardId: job.id,
                branchId: branch.id,
                sparePartId: part.id,
                issuedById: store.id,
                quantity: 1,
                requestId,
              })
            : requisitions.create(
                {
                  jobCardId: job.id,
                  branchId: branch.id,
                  chargeType: "CUSTOMER",
                  requestId,
                  lines: [
                    {
                      sparePartId: part.id,
                      quantityRequired: 2,
                      quantityIssued: 1,
                    },
                  ],
                },
                {
                  userId: store.id,
                  branchId: branch.id,
                  allBranches: false,
                  goodwill: false,
                },
              );
        await issue(randomUUID());
        expect((await snapshot()).actions.startWork).toMatchObject({
          allowed: false,
        });
        const finalRequestId = randomUUID();
        const issued = await issue(finalRequestId);
        await expect(issue(finalRequestId)).resolves.toMatchObject({
          id: issued.id,
        });
      }
      expect((await snapshot()).stage).toBe("PARTS_ISSUED");
      const move = async (
        status: "IN_PROGRESS" | "QC" | "READY",
        actorId: string,
      ) =>
        jobs.updateJobCard(
          job.id,
          { status, workflowVersion: (await snapshot()).version },
          actorId,
        );
      await move("IN_PROGRESS", technician.id);
      await move("QC", technician.id);
      await shop.updateQC(
        job.id,
        "FAILED",
        "Recheck the noise.",
        qc.id,
        (await snapshot()).version,
      );
      expect((await snapshot()).stage).toBe("REWORK");
      await move("QC", technician.id);
      await shop.updateQC(
        job.id,
        "PASSED",
        "Noise resolved.",
        qc.id,
        (await snapshot()).version,
      );
      await move("READY", adviser.id);
      const bill = await new JobBillingService().createJobBill({
        jobCardId: job.id,
        serviceAdvisorId: adviser.id,
        actorId: billing.id,
        partsDiscountPercent: 0,
        labourDiscountPercent: 0,
      });
      expect((await snapshot()).stage).toBe("BILLED");
      expect(bill.total).toBeGreaterThan(500);
      if (coveredPart) {
        const staffInvoice = await new FinanceService().getInvoice(bill.id);
        const portalInvoice = await new PortalService().getInvoice(
          customer.id,
          bill.id,
        );
        expect(portalInvoice.lines).toContainEqual(
          expect.objectContaining({
            description: part.name,
            rate: 0,
            amount: 0,
            isUnderWarranty: true,
          }),
        );
        expect(staffInvoice.printLines).not.toContainEqual(
          expect.objectContaining({ isUnderWarranty: true }),
        );
        expect(portalInvoice.total).toBe(staffInvoice.total);
      }
      const payment = await receipts.createReceipt({
        customerId: customer.id,
        branchId: branch.id,
        issuedById: billing.id,
        mode: "CASH",
        category: "SERVICE_PARTS",
        amount: bill.outstandingAmount,
        allocations: [{ invoiceId: bill.id, amount: bill.outstandingAmount }],
      });
      expect(payment.receiptNumber).toBeTruthy();
      expect((await snapshot()).history.map((row) => row.toStatus)).toEqual(
        expect.arrayContaining(["REWORK", "QC_PASSED", "BILLED"]),
      );
      await expect(
        prisma.partIssuance.count({ where: { jobCardId: job.id } }),
      ).resolves.toBe(needsParts ? 2 : 0);
      await expect(
        prisma.partRequisition.count({ where: { jobCardId: job.id } }),
      ).resolves.toBe(path === "requisition" ? 2 : 0);
      await drainJobcardNotifications(job.id);
      const deliveries = await prisma.notification.findMany({
        where: { link: { startsWith: `/job-cards/${job.id}` } },
        select: { type: true, link: true, userId: true, message: true },
      });
      const recipients = (type: string, tab: string) =>
        deliveries
          .filter(
            (row) => row.type === type && row.link?.endsWith(`?tab=${tab}`),
          )
          .map((row) => row.userId)
          .sort();
      expect(recipients("JOBCARD_ASSIGNED", "labour")).toEqual([technician.id]);
      expect(recipients("INSPECTION_SUBMITTED", "warranty")).toEqual([
        warrantyOfficer.id,
      ]);
      expect(recipients("WARRANTY_RESOLVED", "estimate")).toEqual([adviser.id]);
      expect(recipients("ESTIMATE_APPROVED", "parts")).toEqual([manager.id]);
      expect(recipients("PART_REQUESTED", "parts")).toEqual(
        needsParts ? [store.id] : [],
      );
      expect(recipients("PARTS_ISSUED", "parts")).toEqual(
        needsParts ? [technician.id, technician.id] : [],
      );
      expect(recipients("JOBCARD_STATUS", "qc")).toEqual(
        [adviser.id, qc.id, adviser.id, qc.id].sort(),
      );
      expect(recipients("JOBCARD_QC_FAILED", "qc")).toEqual(
        [adviser.id, manager.id, technician.id].sort(),
      );
      expect(recipients("JOBCARD_QC_PASSED", "qc")).toEqual([adviser.id]);
      expect(recipients("JOBCARD_STATUS", "billing")).toEqual([billing.id]);
      const inspectionMessage = deliveries.find(
        (row) => row.type === "INSPECTION_SUBMITTED",
      )?.message;
      expect(inspectionMessage).toEqual(expect.stringContaining(job.jobNumber));
      expect(inspectionMessage).toContain(vehicle.registrationNumber);
      if (needsParts) {
        expect(inspectionMessage).toContain(part.partNumber);
        expect(inspectionMessage).toContain("quantity 2");
      } else {
        expect(inspectionMessage).toContain("No parts required");
      }

      const legacy = await prisma.jobCard.create({
        data: {
          branchId: branch.id,
          description: "Existing unversioned job",
          jobNumber: `LEGACY-${suffix}`,
          status: "Open",
          createdById: adviser.id,
        },
      });
      await expect(
        readServiceJobInspection(legacy.id, branch.id, {
          userId: adviser.id,
          role: ROLES.SERVICE_ADVISOR,
        }),
      ).resolves.toBeNull();
      await expect(
        jobs.updateJobCard(
          legacy.id,
          { status: "CANCELLED", remarks: "Customer cancelled" },
          adviser.id,
        ),
      ).resolves.toMatchObject({ status: "CANCELLED" });
    },
  );
});
