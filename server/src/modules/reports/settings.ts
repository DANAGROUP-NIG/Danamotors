import { z } from 'zod';
import { BadRequestError } from '../../shared/errors/appError';
import type { ReportDb } from './core/types';

export const FPC_LETTER_TEMPLATE_KEY = 'fpc.letterTemplate';

/** Placeholders the FPC letter can use; each is filled per vehicle when letters are printed. */
export const FPC_LETTER_PLACEHOLDERS = [
  'customer',
  'customerAddress',
  'registration',
  'vin',
  'model',
  'variant',
  'bulletin',
  'subject',
  'measures',
  'branch',
  'branchAddress',
  'branchPhone',
  'branchEmail',
  'date',
] as const;

/** TODO(confirm): #98 open question 5 asks for a printed legacy FPC letter to match. */
export const DEFAULT_FPC_LETTER_TEMPLATE = `Dear {{customer}},

FIELD PRODUCT CHECK: {{subject}}
Bulletin {{bulletin}}

Our records show that your {{model}} {{variant}}, registration {{registration}}, VIN {{vin}}, is included in a field product check issued by the manufacturer.

{{measures}}

The check is carried out free of charge. Please call us on {{branchPhone}} to book a convenient time, or visit our workshop at {{branchAddress}}.

Thank you for choosing us.

Yours faithfully,


Service Manager
{{branch}}`;

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** Placeholders in a template that are not in FPC_LETTER_PLACEHOLDERS. */
export function unknownPlaceholders(template: string): string[] {
  const allowed = new Set<string>(FPC_LETTER_PLACEHOLDERS);
  return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]).filter((name) => !allowed.has(name)))];
}

export const saveSettingsSchema = z.object({
  body: z
    .object({
      // null resets the template to the default.
      fpcLetterTemplate: z.string().trim().min(20, 'The letter is too short').max(5_000).nullable(),
    })
    .strict(),
});

export async function getReportSettings(db: ReportDb) {
  const letter = await db.reportSetting.findUnique({ where: { key: FPC_LETTER_TEMPLATE_KEY } });
  const custom = typeof letter?.value === 'string' ? letter.value : null;
  return {
    fpcLetterTemplate: custom ?? DEFAULT_FPC_LETTER_TEMPLATE,
    fpcLetterIsDefault: custom === null,
    fpcLetterPlaceholders: [...FPC_LETTER_PLACEHOLDERS],
  };
}

export async function saveReportSettings(db: ReportDb, input: z.infer<typeof saveSettingsSchema>['body'], userId: string) {
  if (input.fpcLetterTemplate === null) {
    await db.reportSetting.deleteMany({ where: { key: FPC_LETTER_TEMPLATE_KEY } });
    return getReportSettings(db);
  }
  const unknown = unknownPlaceholders(input.fpcLetterTemplate);
  if (unknown.length) throw new BadRequestError(`Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${unknown.map((name) => `{{${name}}}`).join(', ')}`);
  await db.reportSetting.upsert({
    where: { key: FPC_LETTER_TEMPLATE_KEY },
    create: { key: FPC_LETTER_TEMPLATE_KEY, value: input.fpcLetterTemplate, updatedById: userId },
    update: { value: input.fpcLetterTemplate, updatedById: userId },
  });
  return getReportSettings(db);
}
