import prisma from "../../../src/prisma/client";
import { DEMO_TAG, TEST_PREFIX } from "./fixtures";

/**
 * Puts every warranty case on a TEST- vehicle back to OPEN with no claim lines, so testers
 * can create, submit, approve and reject again. The workflow has no way back to OPEN, so
 * this is a direct reset; it is recorded in the case history and the audit log.
 * Only TEST- cases are touched. The job cards, parts and other cases are left as they are.
 */
export async function resetTestCases(actorId: string) {
  const cases = await prisma.warrantyCase.findMany({
    where: { vehicle: { registrationNumber: { startsWith: TEST_PREFIX } } },
    include: { jobCard: { select: { description: true } }, vehicle: { select: { registrationNumber: true } }, _count: { select: { lines: true } } },
    orderBy: { caseNumber: "asc" },
  });
  const results: { caseNumber: string; registration: string | null; from: string; reset: boolean }[] = [];
  for (const wc of cases) {
    const untouched =
      wc.status === "OPEN" && wc._count.lines === 0 && !wc.complaintCodeId && !wc.manufacturerClaimNo && !wc.submittedAt && !wc.assignedOfficerId;
    if (!untouched) {
      await prisma.$transaction(async (tx) => {
        await tx.warrantyCaseLine.deleteMany({ where: { caseId: wc.id } });
        await tx.warrantyCase.update({
          where: { id: wc.id },
          data: {
            status: "OPEN",
            complaintCodeId: null,
            complaint: wc.jobCard?.description ?? wc.complaint,
            manufacturerClaimNo: null,
            manufacturerClaimDate: null,
            submittedAt: null,
            decisionAt: null,
            rejectReasonId: null,
            claimedAmount: 0,
            approvedAmount: null,
            settledAt: null,
            settlementRef: null,
            settledAmount: null,
            closedAt: null,
            assignedOfficerId: null,
          },
        });
        await tx.warrantyCaseStatusHistory.create({
          data: { caseId: wc.id, fromStatus: wc.status, toStatus: "OPEN", actorId, remarks: `Reset to OPEN by the demo seed (--reset-test)` },
        });
        await tx.auditLog.create({
          data: { userId: actorId, action: "DEMO_SEED_TEST_CASE_RESET", details: JSON.stringify({ caseId: wc.id, caseNumber: wc.caseNumber, from: wc.status }) },
        });
      });
    }
    results.push({ caseNumber: wc.caseNumber, registration: wc.vehicle.registrationNumber, from: wc.status, reset: !untouched });
  }
  console.log(`\n${DEMO_TAG}: TEST- warranty cases`);
  if (results.length === 0) console.log("  None found. Run the demo seed first.");
  for (const r of results) console.log(`  ${r.caseNumber}  ${r.registration}  ${r.reset ? `${r.from} -> OPEN` : "already OPEN and empty"}`);
  return results;
}
