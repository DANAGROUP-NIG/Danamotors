import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
const testUrl = process.env.TEST_DATABASE_URL;
const local =
  !!testUrl &&
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(testUrl).hostname);
if (local) process.env.DATABASE_URL = testUrl;
import prisma from "../../prisma/client";
import {
  assertSignedJobOpening,
  getSignedOpeningConsent,
  printSignedJobOpening,
  signJobOpening,
} from "./job-opening-signature.service";

const integration = local ? describe : describe.skip;
integration("Signed job openings in disposable localhost PostgreSQL", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("persists JSONB evidence, retries once, invalidates changed scope and preserves old signed print data", async () => {
    const rollback = new Error("ROLLBACK_OPENING_SIGNATURE_FIXTURES");
    const original = prisma.$transaction.bind(prisma);
    await expect(
      original(
        async (tx) => {
          const suffix = randomUUID();
          const branch = await tx.branch.create({
            data: { name: `opening-signature-${suffix}` },
          });
          const role = await tx.role.create({
            data: { name: `opening-signature-${suffix}` },
          });
          const actor = await tx.user.create({
            data: {
              email: `${suffix}@example.test`,
              firstName: "Test",
              lastName: "Advisor",
              passwordHash: randomUUID(),
              branchId: branch.id,
              roleId: role.id,
            },
          });
          const customer = await tx.customer.create({
            data: {
              firstName: "Test",
              lastName: "Customer",
              branchId: branch.id,
            },
          });
          const job = await tx.jobCard.create({
            data: {
              branchId: branch.id,
              customerId: customer.id,
              jobNumber: `J-${suffix}`,
              description: "Original opening request",
              status: "OPEN",
              // Past check-in: this test is about the signature evidence, not the check-in gates.
              stage: "ESTIMATE",
              complaints: { create: { description: "Brake noise" } },
            },
          });
          expect(job.openingSignatureRequired).toBe(true);
          await expect(
            assertSignedJobOpening(tx, job.id),
          ).rejects.toMatchObject({ code: "JOB_OPENING_SIGNATURE_REQUIRED" });
          const spy = jest
            .spyOn(prisma, "$transaction")
            .mockImplementation(((
              callback: (client: Prisma.TransactionClient) => Promise<unknown>,
            ) => callback(tx)) as typeof prisma.$transaction);
          try {
            const consent = await getSignedOpeningConsent(job.id, tx);
            const body = {
              accepted: true,
              expectedHash: consent.expectedHash,
              idempotencyKey: randomUUID(),
              signerName: "Test Customer",
              signatureImage:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
            };
            const signed = await signJobOpening(job.id, body, actor.id);
            await expect(
              signJobOpening(job.id, body, actor.id),
            ).resolves.toEqual(signed);
            expect(
              await tx.jobOpeningSignature.count({
                where: { jobCardId: job.id },
              }),
            ).toBe(1);
            await expect(
              assertSignedJobOpening(tx, job.id),
            ).resolves.toBeUndefined();
            await tx.jobCard.update({
              where: { id: job.id },
              data: { description: "Changed opening request" },
            });
            await expect(
              assertSignedJobOpening(tx, job.id),
            ).rejects.toMatchObject({ code: "JOB_OPENING_SIGNATURE_REQUIRED" });
            const oldPrint = await printSignedJobOpening(job.id, signed.id, tx);
            expect(oldPrint.current).toBe(false);
            expect(oldPrint.document.scope.description).toBe(
              "Original opening request",
            );
            const current = await getSignedOpeningConsent(job.id, tx);
            const next = await signJobOpening(
              job.id,
              {
                ...body,
                expectedHash: current.expectedHash,
                idempotencyKey: randomUUID(),
              },
              actor.id,
            );
            expect(next.revision).toBe(2);
            expect(
              await tx.jobOpeningSignature.count({
                where: { jobCardId: job.id },
              }),
            ).toBe(2);
            await expect(
              assertSignedJobOpening(tx, job.id),
            ).resolves.toBeUndefined();
          } finally {
            spy.mockRestore();
          }
          throw rollback;
        },
        { timeout: 30000 },
      ),
    ).rejects.toBe(rollback);
  });
});
