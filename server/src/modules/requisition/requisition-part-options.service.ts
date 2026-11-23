import { ChargeType, PartStatus, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { NotFoundError } from "../../shared/errors/appError";
import { sourceLabel } from "../inventory/partSource";
import {
  assertRequisitionBranch,
  type RequisitionActor,
} from "./requisition.logic";
import { partFamilyId, requisitionPartRate } from "./part-substitution";
import type { RequisitionPartOptionsQuery } from "./requisition.validation";

/** List existing catalogue substitutes and branch stock without issuing or repricing anything. */
export async function listRequisitionPartOptions(
  query: RequisitionPartOptionsQuery,
  actor: RequisitionActor,
) {
  assertRequisitionBranch(actor, query.branchId);
  const requested = await prisma.sparePart.findUnique({
    where: { id: query.partId },
    select: {
      id: true,
      partNumber: true,
      name: true,
      partFlag: true,
      partStatus: true,
      mainPartId: true,
      sourceOfPartId: true,
    },
  });
  if (!requested) throw new NotFoundError("Requested part not found");
  const familyId = partFamilyId(requested);
  const where: Prisma.SparePartWhereInput = {
    partStatus: PartStatus.ACTIVE,
    AND: [
      {
        OR: [
          { id: familyId },
          { mainPartId: familyId },
          { sourceOfPartId: familyId },
        ],
      },
      ...(query.search
        ? [
            {
              OR: [
                {
                  partNumber: {
                    contains: query.search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  name: {
                    contains: query.search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            },
          ]
        : []),
    ],
    ...(query.source ? { partFlag: query.source } : {}),
  };
  const [records, total] = await Promise.all([
    prisma.sparePart.findMany({
      where,
      orderBy: [{ partNumber: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { inventoryStocks: { where: { branchId: query.branchId } } },
    }),
    prisma.sparePart.count({ where }),
  ]);
  return {
    requested: {
      id: requested.id,
      partNumber: requested.partNumber,
      name: requested.name,
    },
    options: records.map((part) => {
      const stock = part.inventoryStocks[0];
      return {
        id: part.id,
        partNumber: part.partNumber,
        name: part.name,
        partFlag: part.partFlag,
        sourceLabel:
          sourceLabel(part.partFlag) === part.partFlag
            ? "Other source"
            : sourceLabel(part.partFlag),
        relationship:
          part.id === requested.id
            ? "requested"
            : part.id === familyId
              ? "main"
              : part.mainPartId
                ? "alternate"
                : "source",
        available: Math.max(
          0,
          (stock?.quantity ?? 0) - (stock?.reservedQuantity ?? 0),
        ),
        normalRate: requisitionPartRate(part, ChargeType.CUSTOMER),
        warrantyRate: requisitionPartRate(part, ChargeType.WARRANTY),
        warrantyApplicable: part.warrantyApplicable,
      };
    }),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
