import { Prisma } from '@prisma/client';
import { canonicalStatusSql, isPdiSql } from '../reports/core/sql';
import type { PsfState } from './psf.validation';

/**
 * Jobs that are followed up (on jobJoinsSql: j job, st service type): delivered, not cancelled, not PDI.
 * Mirrors followUpProblem() in psf.logic.ts.
 */
export const psfEligibleSql = Prisma.sql` AND j."deliveredAt" IS NOT NULL AND ${canonicalStatusSql(Prisma.raw('j."status"'))} <> 'CANCELLED' AND NOT ${isPdiSql}`;

/** The job's follow-up (f) and who made its last call (fu). */
export const psfJoinSql = Prisma.sql`
  LEFT JOIN "PsfFollowUp" f ON f."jobCardId" = j."id"
  LEFT JOIN "User" fu ON fu."id" = f."lastCalledById"`;

/** Accidental jobs: service type in the MIS ACCIDENTAL category, or the legacy service type code AC. */
export const accidentalSql = Prisma.sql`(UPPER(COALESCE(st."category", '')) = 'ACCIDENTAL' OR UPPER(COALESCE(st."code", '')) = 'AC')`;

/** Not contacted: no follow-up, or the last call did not reach the customer (mirrors needsCall()). */
export const notContactedSql = Prisma.sql`(f."id" IS NULL OR f."status" IN ('NO_PHONE', 'NOT_AVAILABLE'))`;

/** Condition for a worklist tab. */
export function stateSql(state: PsfState): Prisma.Sql {
  switch (state) {
    case 'toCall':
      return Prisma.sql` AND ${notContactedSql}`;
    case 'dissatisfied':
      return Prisma.sql` AND f."status" = 'DISSATISFIED'`;
    case 'satisfied':
      return Prisma.sql` AND f."status" = 'SATISFIED'`;
    case 'closed':
      return Prisma.sql` AND f."status" = 'CLOSED'`;
    default:
      return Prisma.empty;
  }
}

/** Registration as typed, reduced to letters and digits (LSD 686-KC = LSD686KC). */
export const plate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const plateSql = Prisma.sql`regexp_replace(UPPER(COALESCE(v."registrationNumber", '')), '[^A-Z0-9]', '', 'g')`;

/** Every phone of customer c, " / " separated. */
export const allPhonesSql = Prisma.sql`NULLIF(CONCAT_WS(' / ', NULLIF(c."phoneNumber", ''), NULLIF(c."mobile2", ''), NULLIF(c."residencePhone", ''), NULLIF(c."office1", ''), NULLIF(c."office2", '')), '')`;

/** True when customer c has no phone of any kind. */
export const noPhoneSql = Prisma.sql`(COALESCE(TRIM(c."phoneNumber"), '') = '' AND COALESCE(TRIM(c."mobile2"), '') = '' AND COALESCE(TRIM(c."residencePhone"), '') = '' AND COALESCE(TRIM(c."office1"), '') = '' AND COALESCE(TRIM(c."office2"), '') = '')`;
