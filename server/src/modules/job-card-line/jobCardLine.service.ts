import { ChargeType, JobCardLine, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { config } from "../../config";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/appError";
import { nextSequenceNumber } from "../../shared/db/documentSequence";
import { coveredItemMatches } from "../campaign/campaign.logic";
import { assertChargeChange, chargeTotals, defaultChargeType, lineAmount } from "./jobCardLine.logic";

type Tx = Prisma.TransactionClient;

/** Part returns in these statuses reduce the quantity charged on the job card. */
const RETURNED_STATUSES = ["Approved", "Completed"];
/** Invoices in these statuses no longer bill their lines. */
const VOID_INVOICE = /cancel|void/i;
/** Claim statuses after which the claimed line's charge type is frozen. */
const FROZEN_CLAIM_STATUSES = ["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "SETTLED"] as const;

export const INVOICE_DOC_TYPE = "INV";

const lineInclude = {
  sparePart: { select: { id: true, partNumber: true, name: true, warrantyApplicable: true } },
  campaign: { select: { id: true, code: true, title: true, type: true } },
  chargeTypeChangedBy: { select: { id: true, firstName: true, lastName: true } },
  invoiceLines: { select: { invoice: { select: { id: true, invoiceNumber: true, status: true } } } },
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

function activeInvoice(line: LineWithRefs) {
  return line.invoiceLines.map((l) => l.invoice).find((i) => !VOID_INVOICE.test(i.status)) ?? null;
}

function frozenClaim(line: LineWithRefs) {
  return line.warrantyCaseLines.map((l) => l.case).find((c) => (FROZEN_CLAIM_STATUSES as readonly string[]).includes(c.status)) ?? null;
}

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
        warrantyCase: { select: { id: true } },
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
    const { warrantyCase, campaigns, ...rest } = jobCard;
    return { jobCard: rest, hasWarrantyCase: Boolean(warrantyCase), campaigns: campaigns.map((c) => c.campaign) };
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
   * Makes sure every part issued to the job card has exactly one priced line, and
   * that quantities reflect approved returns. Safe to call repeatedly; it also
   * backfills job cards created before lines existed.
   */
  async syncPartLines(tx: Tx, jobCardId: string, ctx?: JobContext) {
    const context = ctx ?? (await this.context(tx, jobCardId));
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
      if (line.quantity === net || activeInvoice(line)) continue;
      if (net <= 0) {
        if (line.warrantyCaseLines.length === 0) await tx.jobCardLine.delete({ where: { id: line.id } });
        continue;
      }
      await tx.jobCardLine.update({ where: { id: line.id }, data: { quantity: net, amount: lineAmount(net, line.rate) } });
    }
  }

  private partRate(part: { retailRate: number | null; unitPrice: number; warrantyRate: number | null }, chargeType: ChargeType) {
    if (chargeType === ChargeType.WARRANTY) return part.warrantyRate ?? part.retailRate ?? part.unitPrice;
    return part.retailRate ?? part.unitPrice;
  }

  async list(jobCardId: string) {
    const ctx = await this.context(prisma, jobCardId);
    await prisma.$transaction((tx) => this.syncPartLines(tx, jobCardId, ctx));
    const [lines, warrantyCase] = await Promise.all([
      prisma.jobCardLine.findMany({ where: { jobCardId }, include: lineInclude, orderBy: [{ kind: "desc" }, { createdAt: "asc" }] }),
      prisma.warrantyCase.findUnique({ where: { jobCardId }, select: { id: true, caseNumber: true, status: true } }),
    ]);
    return {
      lines: lines.map((line) => this.present(line)),
      totals: chargeTotals(lines, config.VAT_RATE),
      vatRate: config.VAT_RATE,
      coverageAtCreation: ctx.jobCard.warrantyStatusAtCreation,
      warrantyCase,
      linkedCampaigns: ctx.campaigns.map(({ coveredItems: _items, ...c }) => c),
    };
  }

  private present(line: LineWithRefs) {
    const { invoiceLines: _i, warrantyCaseLines: _w, ...rest } = line;
    const invoice = activeInvoice(line);
    const claim = line.warrantyCaseLines[0]?.case ?? null;
    return { ...rest, invoice, claim, locked: Boolean(invoice || frozenClaim(line)) };
  }

  async addLabour(
    jobCardId: string,
    input: { operationCode?: string | null; description: string; hours: number; rate: number; taxable?: boolean; chargeType?: ChargeType; campaignId?: string | null; reason?: string | null },
    actor: { userId: string; canChargeGoodwill: boolean },
  ) {
    const ctx = await this.context(prisma, jobCardId);
    let chargeType: ChargeType;
    let campaignId: string | null;
    if (input.chargeType) {
      chargeType = input.chargeType;
      ({ campaignId } = assertChargeChange({
        to: input.chargeType,
        campaignId: input.campaignId,
        kind: "LABOUR",
        coverageAtCreation: ctx.jobCard.warrantyStatusAtCreation,
        hasWarrantyCase: ctx.hasWarrantyCase,
        partWarrantyApplicable: null,
        linkedCampaignIds: ctx.campaigns.map((c) => c.id),
        canChargeGoodwill: actor.canChargeGoodwill,
      }));
    } else {
      ({ chargeType, campaignId } = defaultChargeType({
        kind: "LABOUR",
        coverageAtCreation: ctx.jobCard.warrantyStatusAtCreation,
        hasWarrantyCase: ctx.hasWarrantyCase,
        partWarrantyApplicable: null,
        campaignMatchId: this.campaignMatch(ctx, { kind: "LABOUR", operationCode: input.operationCode, description: input.description }),
      }));
    }
    const line = await prisma.jobCardLine.create({
      data: {
        jobCardId,
        kind: "LABOUR",
        operationCode: input.operationCode?.trim() || null,
        description: input.description.trim(),
        quantity: input.hours,
        rate: input.rate,
        amount: lineAmount(input.hours, input.rate),
        taxable: input.taxable ?? true,
        chargeType,
        campaignId,
        createdById: actor.userId,
        ...(input.chargeType && { chargeTypeChangedById: actor.userId, chargeTypeChangedAt: new Date(), chargeTypeReason: input.reason ?? null }),
      },
      include: lineInclude,
    });
    return this.present(line);
  }

  async updateLine(
    jobCardId: string,
    lineId: string,
    input: {
      chargeType?: ChargeType;
      campaignId?: string | null;
      reason?: string | null;
      operationCode?: string | null;
      description?: string;
      hours?: number;
      rate?: number;
      taxable?: boolean;
    },
    actor: { userId: string; canChargeGoodwill: boolean },
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "JobCardLine" WHERE "id" = ${lineId} FOR UPDATE`;
      const line = await tx.jobCardLine.findFirst({ where: { id: lineId, jobCardId }, include: { ...lineInclude, sparePart: true } });
      if (!line) throw new NotFoundError("Line not found on this job card");
      const invoice = activeInvoice(line as unknown as LineWithRefs);
      if (invoice) throw new ConflictError(`This line is billed on invoice ${invoice.invoiceNumber} and cannot be changed`);

      const editingLabour = input.description !== undefined || input.hours !== undefined || input.rate !== undefined || input.operationCode !== undefined;
      if (editingLabour && line.kind !== "LABOUR") {
        throw new BadRequestError("Part lines come from stock issues; change the quantity with a part return");
      }

      const data: Prisma.JobCardLineUncheckedUpdateInput = {};
      if (input.chargeType && input.chargeType !== line.chargeType) {
        const claim = frozenClaim(line as unknown as LineWithRefs);
        if (claim) throw new ConflictError(`This line is on warranty claim ${claim.caseNumber}, which is already ${claim.status.toLowerCase().replace("_", " ")}`);
        const ctx = await this.context(tx, jobCardId);
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
        const ctx = await this.context(tx, jobCardId);
        if (!input.campaignId || !ctx.campaigns.some((c) => c.id === input.campaignId)) {
          throw new BadRequestError("Free lines must be charged to a campaign linked to this job card");
        }
        data.campaignId = input.campaignId;
      }
      if (line.kind === "LABOUR") {
        const hours = input.hours ?? line.quantity;
        const rate = input.rate ?? line.rate;
        if (input.description !== undefined) data.description = input.description.trim();
        if (input.operationCode !== undefined) data.operationCode = input.operationCode?.trim() || null;
        if (input.hours !== undefined || input.rate !== undefined) Object.assign(data, { quantity: hours, rate, amount: lineAmount(hours, rate) });
      }
      if (input.taxable !== undefined) data.taxable = input.taxable;
      return tx.jobCardLine.update({ where: { id: lineId }, data, include: lineInclude });
    });
    return this.present(updated);
  }

  async deleteLine(jobCardId: string, lineId: string) {
    const line = await prisma.jobCardLine.findFirst({ where: { id: lineId, jobCardId }, include: lineInclude });
    if (!line) throw new NotFoundError("Line not found on this job card");
    if (line.kind === "PART") throw new BadRequestError("Part lines come from stock issues; return the part instead");
    const invoice = activeInvoice(line);
    if (invoice) throw new ConflictError(`This line is billed on invoice ${invoice.invoiceNumber}`);
    if (line.warrantyCaseLines.length > 0) throw new ConflictError("This line is on a warranty claim; remove it from the claim first");
    await prisma.jobCardLine.delete({ where: { id: lineId } });
  }

  /**
   * Creates the customer invoice for a job card from its CUSTOMER lines only,
   * snapshotting them as invoice lines. Warranty, goodwill and free lines are never billed.
   */
  async generateInvoice(jobCardId: string, input: { dueDate?: Date | null; notes?: string | null }) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "JobCard" WHERE "id" = ${jobCardId} FOR UPDATE`;
      const ctx = await this.context(tx, jobCardId);
      if (!ctx.jobCard.customerId) throw new BadRequestError("The job card has no customer to invoice");
      const existing = await tx.invoice.findMany({ where: { jobCardId }, select: { invoiceNumber: true, status: true } });
      const live = existing.find((i) => !VOID_INVOICE.test(i.status));
      if (live) throw new ConflictError(`Job card ${ctx.jobCard.jobNumber} is already invoiced on ${live.invoiceNumber}`);

      await this.syncPartLines(tx, jobCardId, ctx);
      const lines: JobCardLine[] = await tx.jobCardLine.findMany({ where: { jobCardId }, orderBy: [{ kind: "desc" }, { createdAt: "asc" }] });
      const customerLines = lines.filter((l) => l.chargeType === ChargeType.CUSTOMER);
      if (customerLines.length === 0) {
        throw new BadRequestError("Nothing to invoice: no line on this job card is charged to the customer");
      }
      const totals = chargeTotals(customerLines, config.VAT_RATE);
      const invoiceNumber = `INV${await nextSequenceNumber(tx, INVOICE_DOC_TYPE)}`;
      return tx.invoice.create({
        data: {
          customerId: ctx.jobCard.customerId,
          jobCardId,
          invoiceNumber,
          dueDate: input.dueDate ?? null,
          subtotal: totals.customer,
          tax: totals.customerTax,
          total: totals.customerInvoiceTotal,
          notes: input.notes ?? null,
          lines: {
            create: customerLines.map((l) => ({
              jobCardLineId: l.id,
              kind: l.kind,
              description: l.description,
              quantity: l.quantity,
              rate: l.rate,
              amount: l.amount,
              taxable: l.taxable,
            })),
          },
        },
        include: { lines: true },
      });
    });
  }
}
