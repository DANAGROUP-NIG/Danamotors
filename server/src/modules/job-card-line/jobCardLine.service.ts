import { ChargeType, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { config } from "../../config";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { coveredItemMatches } from "../campaign/campaign.logic";
import { assertChargeChange, chargeTotals, defaultChargeType, lineAmount } from "./jobCardLine.logic";

type Tx = Prisma.TransactionClient;

/** Part returns in these statuses reduce the quantity charged on the job card. */
const RETURNED_STATUSES = ["Approved", "Completed"];
/** Bills in these statuses no longer bill the job card. */
const VOID_INVOICE = /cancel|void/i;
/** Claim statuses after which the claimed line's charge type is frozen. */
const FROZEN_CLAIM_STATUSES = ["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLED"] as const;
/** The job bill applies VAT as a percentage (config.JOB_BILL_VAT_RATE); line totals use the fraction. */
const VAT_FRACTION = config.JOB_BILL_VAT_RATE / 100;

const lineInclude = {
  sparePart: { select: { id: true, partNumber: true, name: true, warrantyApplicable: true } },
  campaign: { select: { id: true, code: true, title: true, type: true } },
  chargeTypeChangedBy: { select: { id: true, firstName: true, lastName: true } },
  warrantyCaseLines: { select: { case: { select: { id: true, caseNumber: true, status: true } } } },
} satisfies Prisma.JobCardLineInclude;

type LineWithRefs = Prisma.JobCardLineGetPayload<{ include: typeof lineInclude }>;

interface JobContext {
  jobCard: {
    id: string;
    branchId: string;
    customerId: string | null;
    vehicleId: string | null;
    jobNumber: string;
    warrantyStatusAtCreation: Prisma.JobCardGetPayload<object>["warrantyStatusAtCreation"];
  };
  hasWarrantyCase: boolean;
  /** The job card's active bill. Once billed, who pays for each line is fixed. */
  bill: { id: string; invoiceNumber: string; status: string } | null;
  campaigns: {
    id: string;
    code: string;
    title: string;
    type: "RECALL" | "FREE_FIX" | "SERVICE_CAMPAIGN";
    partsCovered: boolean;
    labourCovered: boolean;
    coveredItems: { kind: "PART" | "LABOUR"; partNumber: string | null; operationCode: string | null; description: string }[];
  }[];
}

function frozenClaim(line: LineWithRefs) {
  return line.warrantyCaseLines.map((l) => l.case).find((c) => (FROZEN_CLAIM_STATUSES as readonly string[]).includes(c.status)) ?? null;
}

/**
 * Who pays for each part and labour line on a job card. Lines mirror the job card's
 * stock issues and labour lines (one each); the job bill charges the customer only for
 * CUSTOMER lines, and warranty lines go on the warranty claim.
 */
export class JobCardLineService {
  private async context(db: Tx | typeof prisma, jobCardId: string): Promise<JobContext> {
    const jobCard = await db.jobCard.findUnique({
      where: { id: jobCardId },
      select: {
        id: true,
        branchId: true,
        customerId: true,
        vehicleId: true,
        jobNumber: true,
        warrantyStatusAtCreation: true,
        billedAt: true,
        warrantyCase: { select: { id: true } },
        invoices: { select: { id: true, invoiceNumber: true, status: true }, orderBy: { createdAt: "desc" } },
        campaigns: {
          select: {
            campaign: {
              select: {
                id: true,
                code: true,
                title: true,
                type: true,
                partsCovered: true,
                labourCovered: true,
                coveredItems: { select: { kind: true, partNumber: true, operationCode: true, description: true } },
              },
            },
          },
        },
      },
    });
    if (!jobCard) throw new NotFoundError("Job card not found");
    const { warrantyCase, campaigns, invoices, billedAt, ...rest } = jobCard;
    const activeBill = invoices.find((invoice) => !VOID_INVOICE.test(invoice.status)) ?? null;
    return {
      jobCard: rest,
      hasWarrantyCase: Boolean(warrantyCase),
      bill: activeBill ?? (billedAt ? { id: "", invoiceNumber: "the job bill", status: "BILLED" } : null),
      campaigns: campaigns.map((c) => c.campaign),
    };
  }

  private campaignMatch(ctx: JobContext, line: { kind: "PART" | "LABOUR"; partNumber?: string | null; operationCode?: string | null; description: string }) {
    const match = ctx.campaigns.find(
      (c) =>
        (line.kind === "PART" ? c.partsCovered : c.labourCovered) &&
        c.coveredItems.some((item) => coveredItemMatches(item, line)),
    );
    return match?.id ?? null;
  }

  /**
   * Makes sure every part issued and every labour line on the job card has exactly one
   * charge line, with quantities and prices matching. Safe to call repeatedly; it also
   * backfills job cards created before lines existed. A billed job card is left as billed.
   */
  async syncLines(tx: Tx, jobCardId: string, ctx?: JobContext) {
    const context = ctx ?? (await this.context(tx, jobCardId));
    if (context.bill) return;
    await this.syncPartLines(tx, jobCardId, context);
    await this.syncLabourLines(tx, jobCardId, context);
  }

  private async syncPartLines(tx: Tx, jobCardId: string, context: JobContext) {
    const issuances = await tx.partIssuance.findMany({
      where: { jobCardId },
      include: {
        sparePart: true,
        returns: { where: { status: { in: RETURNED_STATUSES } }, select: { quantity: true } },
        jobCardLine: { include: lineInclude },
      },
    });
    for (const issuance of issuances) {
      const net = issuance.quantity - issuance.returns.reduce((s, r) => s + r.quantity, 0);
      const line = issuance.jobCardLine;
      if (!line) {
        if (net <= 0) continue;
        const part = issuance.sparePart;
        const { chargeType, campaignId } = defaultChargeType({
          kind: "PART",
          coverageAtCreation: context.jobCard.warrantyStatusAtCreation,
          hasWarrantyCase: context.hasWarrantyCase,
          partWarrantyApplicable: part.warrantyApplicable,
          campaignMatchId: this.campaignMatch(context, { kind: "PART", partNumber: part.partNumber, description: part.name }),
        });
        const rate = this.partRate(part, chargeType);
        await tx.jobCardLine.create({
          data: {
            jobCardId,
            kind: "PART",
            sparePartId: part.id,
            partIssuanceId: issuance.id,
            description: part.name,
            quantity: net,
            rate,
            amount: lineAmount(net, rate),
            taxable: part.taxable,
            chargeType,
            campaignId,
            createdById: issuance.issuedById,
          },
        });
        continue;
      }
      if (line.quantity === net) continue;
      if (net <= 0) {
        if (line.warrantyCaseLines.length === 0) await tx.jobCardLine.delete({ where: { id: line.id } });
        continue;
      }
      await tx.jobCardLine.update({ where: { id: line.id }, data: { quantity: net, amount: lineAmount(net, line.rate) } });
    }
  }

  private async syncLabourLines(tx: Tx, jobCardId: string, context: JobContext) {
    const labour = await tx.jobCardLabour.findMany({
      where: { jobCardId },
      include: { labourItem: { select: { code: true } }, chargeLine: { select: { id: true, description: true, quantity: true, rate: true, amount: true } } },
    });
    for (const item of labour) {
      const line = item.chargeLine;
      if (!line) {
        const { chargeType, campaignId } = defaultChargeType({
          kind: "LABOUR",
          coverageAtCreation: context.jobCard.warrantyStatusAtCreation,
          hasWarrantyCase: context.hasWarrantyCase,
          partWarrantyApplicable: null,
          campaignMatchId: this.campaignMatch(context, { kind: "LABOUR", operationCode: item.labourItem.code, description: item.description }),
        });
        await tx.jobCardLine.create({
          data: {
            jobCardId,
            kind: "LABOUR",
            jobCardLabourId: item.id,
            operationCode: item.labourItem.code,
            description: item.description,
            quantity: item.hours,
            rate: item.rate,
            amount: item.amount,
            chargeType,
            campaignId,
          },
        });
        continue;
      }
      if (line.description === item.description && line.quantity === item.hours && line.rate === item.rate && line.amount === item.amount) continue;
      await tx.jobCardLine.update({
        where: { id: line.id },
        data: { description: item.description, quantity: item.hours, rate: item.rate, amount: item.amount },
      });
    }
  }

  private partRate(part: { retailRate: number | null; unitPrice: number; warrantyRate: number | null }, chargeType: ChargeType) {
    if (chargeType === ChargeType.WARRANTY) return part.warrantyRate ?? part.retailRate ?? part.unitPrice;
    return part.retailRate ?? part.unitPrice;
  }

  async list(jobCardId: string) {
    const ctx = await this.context(prisma, jobCardId);
    await prisma.$transaction((tx) => this.syncLines(tx, jobCardId, ctx));
    const [lines, warrantyCase] = await Promise.all([
      prisma.jobCardLine.findMany({ where: { jobCardId }, include: lineInclude, orderBy: [{ kind: "desc" }, { createdAt: "asc" }] }),
      prisma.warrantyCase.findUnique({ where: { jobCardId }, select: { id: true, caseNumber: true, status: true } }),
    ]);
    return {
      lines: lines.map((line) => this.present(line, ctx)),
      totals: chargeTotals(lines, VAT_FRACTION),
      vatRate: VAT_FRACTION,
      bill: ctx.bill,
      coverageAtCreation: ctx.jobCard.warrantyStatusAtCreation,
      warrantyCase,
      linkedCampaigns: ctx.campaigns.map(({ coveredItems: _items, ...c }) => c),
    };
  }

  private present(line: LineWithRefs, ctx: JobContext) {
    const { warrantyCaseLines: _w, ...rest } = line;
    const claim = line.warrantyCaseLines[0]?.case ?? null;
    return { ...rest, invoice: ctx.bill, claim, locked: Boolean(ctx.bill || frozenClaim(line)) };
  }

  async updateLine(
    jobCardId: string,
    lineId: string,
    input: {
      chargeType?: ChargeType;
      campaignId?: string | null;
      reason?: string | null;
    },
    actor: { userId: string; canChargeGoodwill: boolean },
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "JobCardLine" WHERE "id" = ${lineId} FOR UPDATE`;
      const line = await tx.jobCardLine.findFirst({ where: { id: lineId, jobCardId }, include: { ...lineInclude, sparePart: true } });
      if (!line) throw new NotFoundError("Line not found on this job card");
      const ctx = await this.context(tx, jobCardId);
      if (ctx.bill) throw new ConflictError(`Job card ${ctx.jobCard.jobNumber} is billed on ${ctx.bill.invoiceNumber}; who pays can no longer change`);

      const data: Prisma.JobCardLineUncheckedUpdateInput = {};
      if (input.chargeType && input.chargeType !== line.chargeType) {
        const claim = frozenClaim(line as unknown as LineWithRefs);
        if (claim) throw new ConflictError(`This line is on warranty claim ${claim.caseNumber}, which is already ${claim.status.toLowerCase().replace("_", " ")}`);
        const { campaignId } = assertChargeChange({
          to: input.chargeType,
          campaignId: input.campaignId,
          kind: line.kind,
          coverageAtCreation: ctx.jobCard.warrantyStatusAtCreation,
          hasWarrantyCase: ctx.hasWarrantyCase,
          partWarrantyApplicable: line.sparePart?.warrantyApplicable ?? null,
          linkedCampaignIds: ctx.campaigns.map((c) => c.id),
          canChargeGoodwill: actor.canChargeGoodwill,
        });
        Object.assign(data, {
          chargeType: input.chargeType,
          campaignId,
          chargeTypeChangedById: actor.userId,
          chargeTypeChangedAt: new Date(),
          chargeTypeReason: input.reason?.trim() || null,
        });
        if (line.kind === "PART" && line.sparePart) {
          const rate = this.partRate(line.sparePart, input.chargeType);
          Object.assign(data, { rate, amount: lineAmount(line.quantity, rate) });
        }
      } else if (input.campaignId !== undefined && line.chargeType === ChargeType.FREE) {
        if (!input.campaignId || !ctx.campaigns.some((c) => c.id === input.campaignId)) {
          throw new BadRequestError("Free lines must be charged to a campaign linked to this job card");
        }
        data.campaignId = input.campaignId;
      }
      const updated = await tx.jobCardLine.update({ where: { id: lineId }, data, include: lineInclude });
      return this.present(updated, ctx);
    });
    return updated;
  }
}
