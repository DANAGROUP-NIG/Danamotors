import { Prisma, type JobStage, type RepeatJobStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { getBranchSettings } from "../company-settings/company-settings.service";
import {
  ACTIVE_STAGES,
  BOARD_COLUMN_CAP,
  BOARD_COLUMNS,
  columnTargets,
  foldBoardCounts,
  groupBoardCards,
  type BoardCountRow,
  type BoardFilter,
} from "./job-board.logic";
import { isWarrantyJob } from "./job-stage.logic";

const fullName = (user: { firstName: string; lastName: string } | null | undefined) =>
  user ? `${user.firstName} ${user.lastName}`.trim() || null : null;

type Party = { firstName: string; lastName: string; companyName: string | null } | null | undefined;
const partyName = (party: Party) => (party ? party.companyName?.trim() || fullName(party) : null);

/** The WHERE clause shared by the card and count queries: active service jobs of the branch, filtered. */
function boardWhere(filter: BoardFilter): Prisma.Sql {
  const parts = [
    Prisma.sql`"branchId" = ${filter.branchId}`,
    Prisma.sql`"jobType"::text <> 'PDI'`,
    Prisma.sql`"stage"::text IN (${Prisma.join([...ACTIVE_STAGES])})`,
  ];
  if (filter.advisorId) parts.push(Prisma.sql`"serviceAdvisorId" = ${filter.advisorId}`);
  if (filter.technicianId) parts.push(Prisma.sql`"technicianId" = ${filter.technicianId}`);
  if (filter.received) parts.push(Prisma.sql`"createdAt" >= ${filter.received.gte} AND "createdAt" < ${filter.received.lt}`);
  return Prisma.join(parts, " AND ");
}

const cardSelect = {
  id: true,
  jobNumber: true,
  stage: true,
  status: true,
  stageEnteredAt: true,
  stageOwnerRole: true,
  stageOwner: { select: { firstName: true, lastName: true } },
  promisedAt: true,
  warrantyStatusAtCreation: true,
  warrantyCase: { select: { id: true } },
  repeatRecord: { select: { status: true } },
  vehicle: { select: { registrationNumber: true, make: true, model: true } },
  customer: { select: { firstName: true, lastName: true, companyName: true } },
  appointment: { select: { customer: { select: { firstName: true, lastName: true, companyName: true } } } },
} satisfies Prisma.JobCardSelect;

export type BoardCard = {
  id: string;
  jobNumber: string;
  stage: JobStage;
  status: string;
  plate: string | null;
  model: string | null;
  customer: string | null;
  owner: { name: string | null; role: string } | null;
  enteredAt: Date;
  promisedAt: Date | null;
  warranty: boolean;
  repeat: RepeatJobStatus | null;
};

/**
 * The workshop board for one branch: three fixed reads, whatever the number of jobs. The ranked ID query
 * keeps at most 50 jobs per step (the longest waiting), one findMany loads those cards, and one grouped count
 * gives the column totals and summary figures.
 */
export async function loadWorkshopBoard(filter: BoardFilter, now = new Date()) {
  const where = boardWhere(filter);
  const [ranked, counts, settings] = await Promise.all([
    // Billing and Delivery share the Ready column, so each is capped here and the column again after grouping.
    prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM (
        SELECT "id", ROW_NUMBER() OVER (
          PARTITION BY "stage", ("status" = 'WAITING_PARTS')
          ORDER BY "stageEnteredAt" ASC, "id" ASC
        ) AS "rank"
        FROM "JobCard" WHERE ${where}
      ) AS "ranked" WHERE "rank" <= ${BOARD_COLUMN_CAP}`,
    prisma.$queryRaw<BoardCountRow[]>`
      SELECT "stage", "status", COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE "promisedAt" < ${now})::int AS "overdue"
      FROM "JobCard" WHERE ${where}
      GROUP BY "stage", "status"`,
    getBranchSettings(filter.branchId),
  ]);
  const rows = ranked.length
    ? await prisma.jobCard.findMany({ where: { id: { in: ranked.map((row) => row.id) } }, select: cardSelect })
    : [];
  const cards: BoardCard[] = rows.map((row) => ({
    id: row.id,
    jobNumber: row.jobNumber,
    stage: row.stage,
    status: row.status,
    plate: row.vehicle?.registrationNumber?.trim() || null,
    model: [row.vehicle?.make, row.vehicle?.model].filter(Boolean).join(" ").trim() || null,
    customer: partyName(row.customer) ?? partyName(row.appointment?.customer),
    owner: row.stageOwnerRole ? { name: fullName(row.stageOwner), role: row.stageOwnerRole } : null,
    enteredAt: row.stageEnteredAt,
    promisedAt: row.promisedAt,
    warranty: isWarrantyJob(row.warrantyStatusAtCreation, !!row.warrantyCase),
    repeat: row.repeatRecord?.status ?? null,
  }));
  const grouped = groupBoardCards(cards);
  const { totals, summary } = foldBoardCounts(counts);
  const targets = columnTargets(settings);
  return {
    branchId: filter.branchId,
    generatedAt: now,
    summary,
    columns: BOARD_COLUMNS.map((key) => ({ key, total: totals[key], targetMinutes: targets[key], cards: grouped[key] })),
  };
}
