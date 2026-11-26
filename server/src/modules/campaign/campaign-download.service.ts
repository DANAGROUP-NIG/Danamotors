import { CampaignVehicleStatus, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ConflictError, NotFoundError, BadRequestError } from "../../shared/errors/appError";
import { findOpenCampaigns } from "../warranty/warranty.coverage";
import { dayNumberToIso, lagosDayNumber } from "../warranty/warranty.logic";
import {
  MAX_DOCUMENTS_PER_CAMPAIGN,
  affectedVinFileName,
  buildCsv,
  inspectCampaignDocument,
} from "./campaign-download.logic";
import { normalizeVin } from "./campaign.logic";

/** Document fields returned in lists (never the file content). */
export const campaignDocumentSelect = {
  id: true,
  title: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.CampaignDocumentSelect;

const VEHICLE_STATUS_LABEL: Record<CampaignVehicleStatus, string> = {
  PENDING: "Pending",
  CONTACTED: "Contacted",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  NOT_REACHABLE: "Not reachable",
  NOT_APPLICABLE: "Not applicable",
};

/** Largest affected VIN list served in one download. */
const MAX_VIN_ROWS = 100_000;

export interface AffectedVinOptions {
  /** Add customer name and phone (outreach roles only). */
  includeContacts: boolean;
  /** When set, contacts are only filled for vehicles whose customer belongs to this branch. */
  contactBranchId?: string;
}

/**
 * Campaign manuals, the affected VIN download and the open-campaign alert. These are
 * open to every role, so nothing here returns customer contacts unless asked for by an
 * outreach role.
 */
export class CampaignDownloadService {
  async listDocuments(campaignId: string) {
    await this.assertCampaign(campaignId);
    return prisma.campaignDocument.findMany({ where: { campaignId }, select: campaignDocumentSelect, orderBy: { createdAt: "desc" } });
  }

  async getDocumentFile(campaignId: string, documentId: string) {
    const doc = await prisma.campaignDocument.findFirst({
      where: { id: documentId, campaignId },
      select: { fileName: true, contentType: true, sizeBytes: true, data: true },
    });
    if (!doc) throw new NotFoundError("Campaign manual not found");
    return doc;
  }

  async uploadDocument(campaignId: string, input: { title: string; fileName: string; data: string }, actorId: string) {
    const file = inspectCampaignDocument(input.fileName, input.data);
    await this.assertCampaign(campaignId);
    const existing = await prisma.campaignDocument.findMany({ where: { campaignId }, select: { sha256: true, title: true } });
    const same = existing.find((d) => d.sha256 === file.sha256);
    if (same) throw new ConflictError(`This file is already attached to the campaign as "${same.title}"`);
    if (existing.length >= MAX_DOCUMENTS_PER_CAMPAIGN) {
      throw new BadRequestError(`A campaign can hold up to ${MAX_DOCUMENTS_PER_CAMPAIGN} manuals. Remove an old one first.`);
    }
    try {
      return await prisma.campaignDocument.create({
        data: {
          campaignId,
          title: input.title.trim(),
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          data: file.data,
          uploadedById: actorId,
        },
        select: campaignDocumentSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("This file is already attached to the campaign");
      }
      throw error;
    }
  }

  async deleteDocument(campaignId: string, documentId: string) {
    const removed = await prisma.campaignDocument.deleteMany({ where: { id: documentId, campaignId } });
    if (removed.count === 0) throw new NotFoundError("Campaign manual not found");
  }

  /** Every affected VIN of the campaign as a CSV file (UTF-8 with BOM). */
  async affectedVinsCsv(campaignId: string, options: AffectedVinOptions, now = new Date()) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { code: true } });
    if (!campaign) throw new NotFoundError("Campaign not found");
    const rows = await prisma.campaignVehicle.findMany({
      where: { campaignId },
      orderBy: { vin: "asc" },
      take: MAX_VIN_ROWS,
      select: {
        vin: true,
        status: true,
        completedAt: true,
        completedJobCard: { select: { jobNumber: true } },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            registrationNumber: true,
            customer: {
              select: { firstName: true, lastName: true, phoneNumber: true, branchId: true, branch: { select: { name: true } } },
            },
          },
        },
      },
    });

    const headers = ["VIN", "Make", "Model", "Year", "Registration", "Branch", "Status", "Completed on", "Job card"];
    if (options.includeContacts) headers.push("Customer", "Phone");
    const lines = rows.map((r) => {
      const v = r.vehicle;
      const customer = v?.customer ?? null;
      const line = [
        r.vin,
        v?.make ?? "",
        v?.model ?? "",
        v?.year ?? "",
        v?.registrationNumber ?? "",
        customer?.branch?.name ?? (v ? "" : "Not in system"),
        VEHICLE_STATUS_LABEL[r.status],
        r.completedAt ? lagosDate(r.completedAt) : "",
        r.completedJobCard?.jobNumber ?? "",
      ];
      if (options.includeContacts) {
        const visible = customer && (!options.contactBranchId || customer.branchId === options.contactBranchId);
        line.push(visible ? `${customer.firstName} ${customer.lastName}`.trim() : "", visible ? (customer.phoneNumber ?? "") : "");
      }
      return line;
    });
    return { fileName: affectedVinFileName(campaign.code, lagosDate(now)), csv: buildCsv(headers, lines), count: rows.length };
  }

  /**
   * Open campaigns for a vehicle (by id) or a VIN typed before the vehicle exists, with
   * their manuals, for the pop-up alert shown when an affected vehicle is picked.
   */
  async openForVehicle(query: { vehicleId?: string; vin?: string }) {
    let target: { id: string; vin: string };
    if (query.vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: query.vehicleId }, select: { id: true, vin: true } });
      if (!vehicle) throw new NotFoundError("Vehicle not found");
      target = vehicle;
    } else {
      // A VIN with no vehicle yet: match campaign lists by VIN only.
      target = { id: "", vin: normalizeVin(query.vin ?? "") };
    }
    const open = await findOpenCampaigns(prisma, target);
    if (open.length === 0) return { vin: target.vin, campaigns: [] };
    const documents = await prisma.campaignDocument.findMany({
      where: { campaignId: { in: open.map((c) => c.campaignId) } },
      select: { id: true, campaignId: true, title: true, fileName: true, contentType: true, sizeBytes: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      vin: target.vin,
      campaigns: open.map((c) => ({ ...c, documents: documents.filter((d) => d.campaignId === c.campaignId) })),
    };
  }

  private async assertCampaign(campaignId: string) {
    const found = await prisma.campaign.count({ where: { id: campaignId } });
    if (!found) throw new NotFoundError("Campaign not found");
  }
}

function lagosDate(date: Date): string {
  return dayNumberToIso(lagosDayNumber(date));
}
