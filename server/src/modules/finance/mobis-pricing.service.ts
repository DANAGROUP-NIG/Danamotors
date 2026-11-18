/**
 * Finance → Mobis pricing (doc/mobis-pricing.md).
 *
 *  - The conversion rate (₦ per US$) and dealer factor are Finance settings. Mobis MIT import reads the
 *    rate from here; stores cannot type their own.
 *  - A Mobis price bulletin (KIA - Irregular Price Adjustment …xlsx) raises dealer and retail rates of the
 *    parts it lists, only where the dealer rate goes up (legacy DateManager tool).
 *  - Raising the conversion rate can revalue every Mobis part by new rate / old rate (legacy whole-catalogue
 *    batches, e.g. 26 Aug 2024 x1.421 for 1900 → 2700).
 * Every price run is a PartPriceAdjustment, and each part it changed a PartRateHistory row pointing to it.
 */
import { PartPriceAdjustmentKind, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import {
  BulletinLine,
  MOBIS_PRICING_KEY,
  MobisPricing,
  PricedPart,
  REVALUED_PART_FLAGS,
  cleanBulletinLines,
  planBulletin,
  readPricing,
  revaluationRatio,
} from "./mobis-pricing.logic";

type Db = Pick<typeof prisma, "financeSetting"> | Prisma.TransactionClient;
type Actor = { userId: string };

const TX_OPTIONS = { timeout: 180_000, maxWait: 10_000 };
const userSelect = { select: { id: true, firstName: true, lastName: true } } as const;

export async function getMobisPricing(db: Db = prisma): Promise<MobisPricing & { updatedAt: Date | null }> {
  const row = await db.financeSetting.findUnique({ where: { key: MOBIS_PRICING_KEY } });
  return { ...readPricing(row?.value), updatedAt: row?.updatedAt ?? null };
}

/** Parts a bulletin may price: Mobis part numbers, never the local/used/repaired source records. */
async function pricedParts(tx: Prisma.TransactionClient | typeof prisma, partNumbers: string[]): Promise<PricedPart[]> {
  const parts = await tx.sparePart.findMany({
    where: { partNumber: { in: partNumbers, mode: "insensitive" }, sourceOfPartId: null },
    select: {
      id: true, partNumber: true, name: true, partFlag: true, priceCategoryCode: true, unitPrice: true, retailRate: true,
      priceCategory: { select: { markupMultiplier: true } },
    },
  });
  return parts.map(({ priceCategory, ...p }) => ({ ...p, multiplier: priceCategory?.markupMultiplier ?? null }));
}

export async function previewBulletin(lines: BulletinLine[]) {
  const clean = cleanBulletinLines(lines);
  if (!clean.length) throw new BadRequestError("The bulletin has no part numbers with a list price");
  const pricing = await getMobisPricing();
  const parts = await pricedParts(prisma, clean.map((l) => l.partNumber));
  return { pricing, ...planBulletin(clean, parts, pricing) };
}

export interface ApplyBulletinInput {
  reference: string;
  sourceFileName?: string;
  effectiveDate?: Date;
  remarks?: string;
  lines: BulletinLine[];
  /** The rate and factor the preview was made with; refused if Finance changed them since. */
  conversionRate: number;
  dealerFactor: number;
}

export async function applyBulletin(actor: Actor, input: ApplyBulletinInput) {
  const clean = cleanBulletinLines(input.lines);
  if (!clean.length) throw new BadRequestError("The bulletin has no part numbers with a list price");
  const reference = input.reference.trim();

  const adjustmentId = await prisma.$transaction(async (tx) => {
    // One price run at a time, so two Finance users cannot interleave on the same parts.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('mobis-pricing'))`;
    const pricing = await getMobisPricing(tx);
    if (pricing.conversionRate !== input.conversionRate || pricing.dealerFactor !== input.dealerFactor) {
      throw new ConflictError("The conversion rate or dealer factor changed since the preview. Preview the bulletin again.");
    }
    const duplicate = await tx.partPriceAdjustment.findFirst({
      where: { kind: PartPriceAdjustmentKind.BULLETIN, reference: { equals: reference, mode: "insensitive" } },
      select: { number: true },
    });
    if (duplicate) throw new ConflictError(`Bulletin "${reference}" was already applied as price adjustment ${duplicate.number}`);

    const parts = await pricedParts(tx, clean.map((l) => l.partNumber));
    if (parts.length) {
      await tx.$queryRaw`SELECT id FROM "SparePart" WHERE id = ANY(${parts.map((p) => p.id)}::text[]) FOR UPDATE`;
    }
    const plan = planBulletin(clean, await pricedParts(tx, clean.map((l) => l.partNumber)), pricing);
    const increases = plan.rows.filter((r) => r.status === "INCREASE");
    if (!increases.length) throw new BadRequestError("No part's dealer rate goes up with this bulletin, so nothing would change");

    const adjustment = await tx.partPriceAdjustment.create({
      data: {
        kind: PartPriceAdjustmentKind.BULLETIN,
        reference,
        sourceFileName: input.sourceFileName,
        effectiveDate: input.effectiveDate,
        conversionRate: pricing.conversionRate,
        dealerFactor: pricing.dealerFactor,
        linesInFile: plan.summary.lines,
        updatedCount: increases.length,
        notHigherCount: plan.summary.notHigher,
        notFoundCount: plan.summary.notFound,
        remarks: input.remarks?.trim() || undefined,
        appliedById: actor.userId,
      },
    });
    const updated = await bulkSetRates(tx, adjustment.id, actor.userId, increases.map((r) => ({
      id: r.partId!, dealer: r.newDealerRate, retail: r.newRetailRate,
    })));
    if (updated !== increases.length) throw new ConflictError("Some part rates changed while the bulletin was applied. Try again.");
    return adjustment.id;
  }, TX_OPTIONS);
  return getAdjustment(adjustmentId);
}

/** Sets new rates and writes PartRateHistory in two statements, only where the dealer rate still goes up. */
async function bulkSetRates(tx: Prisma.TransactionClient, adjustmentId: string, userId: string, rows: { id: string; dealer: number; retail: number | null }[]) {
  const ids = rows.map((r) => r.id);
  const dealers = rows.map((r) => r.dealer);
  const retails = rows.map((r) => r.retail);
  const result = await tx.$queryRaw<{ n: bigint }[]>`
    WITH v AS (
      SELECT * FROM unnest(${ids}::text[], ${dealers}::float8[], ${retails}::float8[]) AS v(id, dealer, retail)
    ), old AS (
      SELECT p.id, p."unitPrice" AS old_dr, p."retailRate" AS old_rr FROM "SparePart" p JOIN v ON v.id = p.id WHERE v.dealer > p."unitPrice"
    ), upd AS (
      UPDATE "SparePart" p SET "unitPrice" = v.dealer, "retailRate" = v.retail, "updatedAt" = now()
      FROM v JOIN old ON old.id = v.id WHERE p.id = v.id
      RETURNING p.id, p."partNumber", p.name, p."partFlag", p."priceCategoryCode", old.old_dr, old.old_rr, p."unitPrice" AS new_dr, p."retailRate" AS new_rr
    ), hist AS (
      INSERT INTO "PartRateHistory" ("id", "partId", "partNumber", "description", "partFlag", "priceCategoryCode", "action",
        "oldDealerRate", "newDealerRate", "oldRetailRate", "newRetailRate", "changedById", "changedAt", "adjustmentId")
      SELECT gen_random_uuid()::text, id, "partNumber", name, "partFlag", "priceCategoryCode", 'EDITED',
        old_dr, new_dr, old_rr, new_rr, ${userId}, now(), ${adjustmentId} FROM upd
      RETURNING 1
    )
    SELECT COUNT(*) AS n FROM hist`;
  return Number(result[0]?.n ?? 0);
}

const revaluedWhere = Prisma.sql`"partFlag" IN (${Prisma.join([...REVALUED_PART_FLAGS])}) AND "sourceOfPartId" IS NULL AND "unitPrice" > 0`;

/** How many parts a rate change would revalue, and by what factor. */
export async function previewRevaluation(toRate: number) {
  const pricing = await getMobisPricing();
  const ratio = revaluationRatio(pricing.conversionRate, toRate);
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "SparePart" WHERE ${revaluedWhere}`;
  return { fromRate: pricing.conversionRate, toRate, ratio, parts: ratio ? Number(n) : 0, partFlags: REVALUED_PART_FLAGS };
}

export interface SavePricingInput {
  conversionRate: number;
  dealerFactor: number;
  /** Raise O and A part rates by new rate / old rate (only when the rate goes up). */
  revalue?: boolean;
  remarks?: string;
}

export async function saveMobisPricing(actor: Actor, input: SavePricingInput) {
  if (!(input.conversionRate > 0) || !(input.dealerFactor > 0) || input.dealerFactor > 1) {
    throw new BadRequestError("The conversion rate must be above zero and the dealer factor between 0 and 1");
  }
  const adjustmentId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('mobis-pricing'))`;
    const current = await getMobisPricing(tx);
    const value = { conversionRate: input.conversionRate, dealerFactor: input.dealerFactor };
    await tx.financeSetting.upsert({ where: { key: MOBIS_PRICING_KEY }, create: { key: MOBIS_PRICING_KEY, value }, update: { value } });
    await tx.auditLog.create({
      data: {
        userId: actor.userId,
        action: "MOBIS_PRICING_UPDATED",
        details: JSON.stringify({ from: { conversionRate: current.conversionRate, dealerFactor: current.dealerFactor }, to: value, revalue: !!input.revalue }),
      },
    });

    const ratio = revaluationRatio(current.conversionRate, input.conversionRate);
    if (!input.revalue) return null;
    if (!ratio) throw new BadRequestError("Prices are only revalued when the conversion rate goes up");

    const adjustment = await tx.partPriceAdjustment.create({
      data: {
        kind: PartPriceAdjustmentKind.RATE_CHANGE,
        reference: `Conversion rate ${current.conversionRate} → ${input.conversionRate}`,
        conversionRate: input.conversionRate,
        previousRate: current.conversionRate,
        updatedCount: 0,
        remarks: input.remarks?.trim() || undefined,
        appliedById: actor.userId,
      },
    });
    const result = await tx.$queryRaw<{ n: bigint }[]>`
      WITH t AS (
        SELECT id, "unitPrice" AS old_dr, "retailRate" AS old_rr FROM "SparePart" WHERE ${revaluedWhere} FOR UPDATE
      ), upd AS (
        UPDATE "SparePart" p SET
          "unitPrice" = round((t.old_dr * ${ratio})::numeric, 2)::float8,
          "retailRate" = CASE WHEN t.old_rr IS NULL THEN NULL ELSE round((t.old_rr * ${ratio})::numeric, 2)::float8 END,
          "updatedAt" = now()
        FROM t WHERE p.id = t.id
        RETURNING p.id, p."partNumber", p.name, p."partFlag", p."priceCategoryCode", t.old_dr, t.old_rr, p."unitPrice" AS new_dr, p."retailRate" AS new_rr
      ), hist AS (
        INSERT INTO "PartRateHistory" ("id", "partId", "partNumber", "description", "partFlag", "priceCategoryCode", "action",
          "oldDealerRate", "newDealerRate", "oldRetailRate", "newRetailRate", "changedById", "changedAt", "adjustmentId")
        SELECT gen_random_uuid()::text, id, "partNumber", name, "partFlag", "priceCategoryCode", 'EDITED',
          old_dr, new_dr, old_rr, new_rr, ${actor.userId}, now(), ${adjustment.id} FROM upd
        RETURNING 1
      )
      SELECT COUNT(*) AS n FROM hist`;
    await tx.partPriceAdjustment.update({ where: { id: adjustment.id }, data: { updatedCount: Number(result[0]?.n ?? 0) } });
    return adjustment.id;
  }, TX_OPTIONS);

  return { pricing: await getMobisPricing(), adjustment: adjustmentId ? await getAdjustment(adjustmentId) : null };
}

export async function listAdjustments() {
  return prisma.partPriceAdjustment.findMany({ orderBy: { appliedAt: "desc" }, include: { appliedBy: userSelect }, take: 200 });
}

export async function getAdjustment(id: string, page = 1, pageSize = 200) {
  const adjustment = await prisma.partPriceAdjustment.findUnique({ where: { id }, include: { appliedBy: userSelect } });
  if (!adjustment) throw new NotFoundError("Price adjustment not found");
  const [changes, total] = await Promise.all([
    prisma.partRateHistory.findMany({
      where: { adjustmentId: id },
      orderBy: { partNumber: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { partId: true, partNumber: true, description: true, partFlag: true, priceCategoryCode: true, oldDealerRate: true, newDealerRate: true, oldRetailRate: true, newRetailRate: true },
    }),
    prisma.partRateHistory.count({ where: { adjustmentId: id } }),
  ]);
  return { adjustment, changes, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

