import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { attributeBody, cardBody, responseBody } from './csi.validation';

export const MASTER_PAGE_SIZE = 25;
export const cardRevisionInclude = {
  attributes: { orderBy: { sequence: 'asc' } },
  responses: { orderBy: { sequence: 'asc' } },
} satisfies Prisma.CsiCardRevisionInclude;
const latestRevision = {
  revisions: { orderBy: { version: 'desc' }, take: 1, include: cardRevisionInclude },
} satisfies Prisma.CsiCardInclude;

type AttributeInput = z.infer<typeof attributeBody>;
type ResponseInput = z.infer<typeof responseBody>;
type CardInput = z.infer<typeof cardBody>;
type Scope = { branchId: string; actorId: string };

async function write<T>(scope: Scope, entity: string, id: string | undefined, save: (tx: Prisma.TransactionClient) => Promise<T & { id: string }>) {
  try {
    return await prisma.$transaction(async tx => {
      const record = await save(tx);
      await tx.auditLog.create({
        data: { userId: scope.actorId, action: id ? 'CSI_MASTER_UPDATED' : 'CSI_MASTER_CREATED',
          details: JSON.stringify({ entity, id: record.id, branchId: scope.branchId }) },
      });
      return record;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictError('This code is already in use in the selected branch');
      if (error.code === 'P2025') throw new NotFoundError('CSI record was not found in the selected branch');
    }
    throw error;
  }
}

export class CsiMasterService {
  /** Lists masters in code order with a fixed page size and stable branch scope. */
  async list(branchId: string, kind: 'attributes' | 'responses' | 'cards', page: number) {
    const options = { where: { branchId }, skip: (page - 1) * MASTER_PAGE_SIZE, take: MASTER_PAGE_SIZE + 1, orderBy: { code: 'asc' } } as const;
    const rows = kind === 'attributes' ? await prisma.csiAttribute.findMany(options)
      : kind === 'responses' ? await prisma.csiResponse.findMany(options)
      : await prisma.csiCard.findMany({ ...options, include: latestRevision });
    return { items: rows.slice(0, MASTER_PAGE_SIZE), page, hasNext: rows.length > MASTER_PAGE_SIZE };
  }

  /** Saves one attribute and records the change in the same transaction. */
  saveAttribute(scope: Scope, data: AttributeInput, id?: string) {
    const branchId = scope.branchId;
    return write(scope, 'attribute', id, tx => id
      ? tx.csiAttribute.update({ where: { branchId_id: { branchId, id } }, data })
      : tx.csiAttribute.create({ data: { ...data, branchId } }));
  }

  /** Saves one response rating and records the change in the same transaction. */
  saveResponse(scope: Scope, data: ResponseInput, id?: string) {
    const branchId = scope.branchId;
    return write(scope, 'response', id, tx => id
      ? tx.csiResponse.update({ where: { branchId_id: { branchId, id } }, data })
      : tx.csiResponse.create({ data: { ...data, branchId } }));
  }

  /** Appends a card revision and copies the referenced branch masters into it. */
  saveCard(scope: Scope, data: CardInput, edit?: { id: string; version: number }) {
    const { branchId } = scope;
    return write(scope, 'card', edit?.id, async tx => {
      const current = edit ? await tx.csiCard.findUnique({
        where: { branchId_id: { branchId, id: edit.id } }, include: latestRevision,
      }) : null;
      if (edit && !current) throw new NotFoundError('CSI card was not found in the selected branch');
      if (edit && current?.version !== edit.version) throw new ConflictError('This card changed. Reload it and try again');

      const [attributes, responses] = await Promise.all([
        tx.csiAttribute.findMany({ where: { branchId, id: { in: data.attributes.map(row => row.attributeId) } } }),
        tx.csiResponse.findMany({ where: { branchId, id: { in: data.responses.map(row => row.responseId) } } }),
      ]);
      const attributeMap = new Map(attributes.map(row => [row.id, row]));
      const responseMap = new Map(responses.map(row => [row.id, row]));
      const prior = current?.revisions[0];
      const attributeRows = data.attributes.map((row, index) => {
        const master = attributeMap.get(row.attributeId);
        const previous = prior?.attributes.find(item => item.attributeId === row.attributeId);
        if (previous) return { ...row, description: previous.description, sequence: index + 1 };
        if (!master?.active) throw new BadRequestError('Choose active attributes from the selected branch');
        return { ...row, description: master.description, sequence: index + 1 };
      });
      const responseRows = data.responses.map((row, index) => {
        const master = responseMap.get(row.responseId);
        const previous = prior?.responses.find(item => item.responseId === row.responseId);
        if (previous) return { ...row, description: previous.description, sequence: index + 1 };
        if (!master?.active) throw new BadRequestError('Choose active responses from the selected branch');
        return { ...row, description: master.description, sequence: index + 1 };
      });

      const { code, active, description, cardDate, effectiveDate, appliesTo } = data;
      const version = edit ? edit.version + 1 : 1;
      if (edit) {
        const updated = await tx.csiCard.updateMany({
          where: { branchId, id: edit.id, version: edit.version },
          data: { code, active, version },
        });
        if (!updated.count) throw new ConflictError('This card changed. Reload it and try again');
      }
      const card = edit ? { id: edit.id } : await tx.csiCard.create({ data: { branchId, code, active } });
      await tx.csiCardRevision.create({
        data: {
          branchId, cardId: card.id, version, code, description, appliesTo,
          cardDate: new Date(cardDate), effectiveDate: new Date(effectiveDate),
          attributes: { createMany: { data: attributeRows } },
          responses: { createMany: { data: responseRows } },
        },
      });
      return tx.csiCard.findUniqueOrThrow({ where: { id: card.id }, include: latestRevision });
    });
  }
}
