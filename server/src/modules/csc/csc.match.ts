import { Prisma } from '@prisma/client';
import { localDateOf, REPORT_TZ } from '../reports/core/dates';

type Db = Prisma.TransactionClient;

/** Jobs that count as a visit: not cancelled, not PDI (alias j, service type st). */
const visitJobSql = Prisma.sql`
  j."status" NOT IN ('CANCELLED', 'Cancelled')
  AND j."jobType" <> 'PDI'
  AND NOT COALESCE(st."preDelivery", false)
  AND UPPER(COALESCE(st."category", '')) <> 'PDI'`;

const branchSql = (branchIds: string[] | null) =>
  branchIds ? Prisma.sql` AND c."branchId" IN (${Prisma.join(branchIds)})` : Prisma.empty;

/**
 * A job opened for the vehicle satisfies its open cases due from `dueDate − matchDaysBefore` on
 * (late visits count too). Returns how many cases it closed as visited.
 */
export async function matchCasesForJob(tx: Db, input: { jobCardId: string; vehicleId: string; at: Date }): Promise<number> {
  const jobDate = localDateOf(input.at, REPORT_TZ);
  return tx.$executeRaw`
    UPDATE "CscCase" SET "status" = 'VISITED', "visitJobCardId" = ${input.jobCardId}, "visitedAt" = ${input.at}, "updatedAt" = ${input.at}
    WHERE "vehicleId" = ${input.vehicleId} AND "status" = 'OPEN' AND "dueDate" - "matchDaysBefore" <= ${jobDate}::date`;
}

/**
 * Matching inside the job-opening transaction. It must never stop a job from opening, so it runs in
 * a savepoint; a failure is rolled back and recorded (the next case list load matches it instead).
 */
export async function matchCasesSafely(tx: Db, input: { jobCardId: string; vehicleId: string; at: Date; actorId: string }): Promise<number> {
  try {
    await tx.$executeRaw`SAVEPOINT csc_matching`;
  } catch {
    return 0;
  }
  try {
    const matched = await matchCasesForJob(tx, input);
    await tx.$executeRaw`RELEASE SAVEPOINT csc_matching`;
    return matched;
  } catch (error) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT csc_matching`;
    await tx.auditLog.create({
      data: {
        userId: input.actorId,
        action: 'CSC_MATCH_FAILED',
        details: JSON.stringify({ jobCardId: input.jobCardId, vehicleId: input.vehicleId, error: error instanceof Error ? error.message : String(error) }),
      },
    });
    return 0;
  }
}

/**
 * Brings cases in line with the job cards: re-opens cases whose visit job was cancelled, then closes
 * open cases that a visit job satisfies (earliest matching job is linked). Idempotent.
 */
export async function reconcileCases(db: Db, branchIds: string[] | null): Promise<{ reopened: number; matched: number }> {
  const reopened = await db.$executeRaw`
    UPDATE "CscCase" c SET "status" = 'OPEN', "visitJobCardId" = NULL, "visitedAt" = NULL, "updatedAt" = NOW()
    FROM "JobCard" j
    WHERE c."visitJobCardId" = j."id" AND c."status" = 'VISITED' AND j."status" IN ('CANCELLED', 'Cancelled')${branchSql(branchIds)}`;
  const matched = await db.$executeRaw`
    UPDATE "CscCase" c SET "status" = 'VISITED', "visitJobCardId" = m."jobId", "visitedAt" = m."createdAt", "updatedAt" = NOW()
    FROM (
      SELECT DISTINCT ON (c."id") c."id" AS "caseId", j."id" AS "jobId", j."createdAt"
      FROM "CscCase" c
      JOIN "JobCard" j ON j."vehicleId" = c."vehicleId"
      LEFT JOIN "WorkshopMaster" st ON st."id" = j."serviceTypeId"
      WHERE c."status" = 'OPEN'${branchSql(branchIds)}
        AND ${visitJobSql}
        AND ((j."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TZ})::date >= c."dueDate" - c."matchDaysBefore"
      ORDER BY c."id", j."createdAt" ASC
    ) m
    WHERE c."id" = m."caseId"`;
  return { reopened, matched };
}
