import { DocumentTermType, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';
import { NotFoundError } from '../../shared/errors/appError';

const documentType = z.nativeEnum(DocumentTermType);

export const termsScopeSchema = z.object({
  query: z.object({
    documentType,
    // Omitted: the company-wide terms.
    branchId: z.string().uuid().optional(),
  }),
});

export const saveTermsSchema = z.object({
  body: z.object({
    documentType,
    branchId: z.string().uuid().nullable(),
    terms: z.array(z.string().trim().min(1).max(500)).max(20),
    footer: z.string().trim().max(500).nullable(),
  }).strict(),
});

type SaveTerms = z.infer<typeof saveTermsSchema>['body'];

const empty = {
  terms: [] as string[],
  footer: null as string | null,
};

// Legacy Quotation Terms and Conditions Master and the Control screen's terms and footer messages.
export class DocumentTermsService {
  private find(db: Prisma.TransactionClient, type: DocumentTermType, branchId: string | null) {
    return db.documentTerms.findFirst({
      where: {
        documentType: type,
        branchId,
      },
    });
  }

  async get(type: DocumentTermType, branchId?: string) {
    const row = await this.find(prisma, type, branchId ?? null);

    return row ? {
      terms: row.terms,
      footer: row.footer,
    } : empty;
  }

  // What prints: the branch's own terms and footer where set, otherwise the company-wide ones.
  async effective(type: DocumentTermType, branchId?: string) {
    const [company, branch] = await Promise.all([
      this.find(prisma, type, null),
      branchId ? this.find(prisma, type, branchId) : null,
    ]);

    return {
      terms: branch?.terms.length ? branch.terms : company?.terms ?? [],
      footer: branch?.footer || company?.footer || null,
    };
  }

  async save({ documentType: type, branchId, terms, footer }: SaveTerms) {
    if (branchId && !(await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } })))
      throw new NotFoundError('Branch not found');

    const data = {
      terms,
      footer: footer || null,
    };

    return prisma.$transaction(async tx => {
      const existing = await this.find(tx, type, branchId);

      return existing ? tx.documentTerms.update({
        where: {
          id: existing.id,
        },

        data,
      }) : tx.documentTerms.create({
        data: {
          documentType: type,
          branchId,
          ...data,
        },
      });
    });
  }
}
