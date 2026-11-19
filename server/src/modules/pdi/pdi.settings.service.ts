import { PdiSettings, Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { NotFoundError } from '../../shared/errors/appError';
import { assertEditable, assertNotFrozen, type PdiLockedDocument } from './pdi.logic';
import type { PdiSettingsInput } from './pdi.validation';

type Db = Prisma.TransactionClient | typeof prisma;

const SETTINGS_ID = 'default';

/** Same defaults as the PdiSettings model, used until the row is first saved. */
export const DEFAULT_PDI_SETTINGS: PdiSettings = {
  id: SETTINGS_ID,
  jobFreezeDate: null, requisitionFreezeDate: null, returnFreezeDate: null, labourFreezeDate: null, billFreezeDate: null,
  jobEditBeforePrint: true, jobEditAfterPrint: false,
  requisitionEditBeforePrint: true, requisitionEditAfterPrint: false,
  returnEditBeforePrint: true, returnEditAfterPrint: false,
  labourEditBeforePrint: true, labourEditAfterPrint: false,
  billEditBeforePrint: true, billEditAfterPrint: false,
  roundBill: true, defaultCustomerId: null, includeInHistory: false, postBillsToTally: true,
  invoiceTitle: 'PDI INVOICE', cashMemoTitle: 'PDI CASH MEMO',
  updatedById: null, updatedAt: new Date(0),
};

export async function getPdiSettings(db: Db = prisma): Promise<PdiSettings> {
  return (await db.pdiSettings.findUnique({ where: { id: SETTINGS_ID } })) ?? DEFAULT_PDI_SETTINGS;
}

export function freezeDateOf(settings: PdiSettings, document: PdiLockedDocument): Date | null {
  return settings[`${document}FreezeDate`];
}

export function editRulesOf(settings: PdiSettings, document: PdiLockedDocument) {
  return { beforePrint: settings[`${document}EditBeforePrint`], afterPrint: settings[`${document}EditAfterPrint`] };
}

/**
 * Freeze date and print rules for a PDI document. Creating a document checks the freeze date only;
 * changing or cancelling one also checks the before/after print rule.
 */
export async function assertPdiDocumentChange(db: Db, document: PdiLockedDocument, documentDate: Date, change: { printedAt?: Date | null; create?: boolean } = {}) {
  const settings = await getPdiSettings(db);
  assertNotFrozen(document, freezeDateOf(settings, document), documentDate);
  if (!change.create) assertEditable(document, change.printedAt, editRulesOf(settings, document));
}

const dateOrNull = (value: string | null | undefined) => value === undefined ? undefined : value === null ? null : new Date(`${value}T00:00:00.000Z`);

export async function getPdiSettingsView() {
  const settings = await getPdiSettings();
  const defaultCustomer = settings.defaultCustomerId
    ? await prisma.customer.findUnique({ where: { id: settings.defaultCustomerId }, select: { id: true, firstName: true, lastName: true, companyName: true } })
    : null;
  return { ...settings, defaultCustomer };
}

export async function updatePdiSettings(input: PdiSettingsInput, actorId: string) {
  return prisma.$transaction(async tx => {
    if (input.defaultCustomerId && !await tx.customer.findFirst({ where: { id: input.defaultCustomerId, mergedIntoId: null }, select: { id: true } }))
      throw new NotFoundError('Default PDI customer not found');
    const { jobFreezeDate, requisitionFreezeDate, returnFreezeDate, labourFreezeDate, billFreezeDate, ...rest } = input;
    const data = {
      ...rest,
      jobFreezeDate: dateOrNull(jobFreezeDate), requisitionFreezeDate: dateOrNull(requisitionFreezeDate), returnFreezeDate: dateOrNull(returnFreezeDate),
      labourFreezeDate: dateOrNull(labourFreezeDate), billFreezeDate: dateOrNull(billFreezeDate), updatedById: actorId,
    };
    const before = await getPdiSettings(tx);
    const saved = await tx.pdiSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
    await tx.auditLog.create({ data: { userId: actorId, action: 'PDI_SETTINGS_UPDATED', details: JSON.stringify({ before: { ...before, updatedAt: undefined }, after: { ...saved, updatedAt: undefined } }) } });
    return saved;
  });
}
