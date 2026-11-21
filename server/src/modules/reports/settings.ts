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

export const PSF_LETTER_TEMPLATE_KEY = 'psf.letterTemplate';

/** Placeholders the post-service follow-up letter can use; filled per customer (their latest job in the period). */
export const PSF_LETTER_PLACEHOLDERS = [
  'customer',
  'customerAddress',
  'registration',
  'registrations',
  'model',
  'jobNumber',
  'deliveryDate',
  'serviceType',
  'branch',
  'branchAddress',
  'branchPhone',
  'branchEmail',
  'date',
] as const;

/** TODO(confirm): #111 has no printed legacy follow-up letter to match; neutral wording. */
export const DEFAULT_PSF_LETTER_TEMPLATE = `Dear {{customer}},

YOUR RECENT SERVICE VISIT

Thank you for bringing your {{model}}, registration {{registration}}, to our workshop. The vehicle was delivered to you on {{deliveryDate}} (job {{jobNumber}}, {{serviceType}}).

We tried to reach you by phone to ask whether you are satisfied with the work done, but we could not get through. Your opinion matters to us: if anything about the service was not right, or you have a question about the work, please call us on {{branchPhone}} or write to {{branchEmail}}, and we will attend to it promptly.

Please also let us know a phone number we can reach you on, so that we can keep you informed about your vehicle.

Thank you for choosing us.

Yours faithfully,


Service Manager
{{branch}}`;

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** Placeholders in a template that are not allowed (by default: not in FPC_LETTER_PLACEHOLDERS). */
export function unknownPlaceholders(template: string, allowedNames: readonly string[] = FPC_LETTER_PLACEHOLDERS): string[] {
  const allowed = new Set<string>(allowedNames);
  return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]).filter((name) => !allowed.has(name)))];
}

const letterTemplate = z.string().trim().min(20, 'The letter is too short').max(5_000).nullable().optional();

export const saveSettingsSchema = z.object({
  body: z
    .object({
      // null resets a template to the default; a template left out is not changed.
      fpcLetterTemplate: letterTemplate,
      psfLetterTemplate: letterTemplate,
    })
    .strict()
    .refine((body) => body.fpcLetterTemplate !== undefined || body.psfLetterTemplate !== undefined, 'Nothing to save'),
});

export async function getReportSettings(db: ReportDb) {
  const saved = await db.reportSetting.findMany({ where: { key: { in: [FPC_LETTER_TEMPLATE_KEY, PSF_LETTER_TEMPLATE_KEY] } } });
  const custom = (key: string) => {
    const value = saved.find((row) => row.key === key)?.value;
    return typeof value === 'string' ? value : null;
  };
  const fpc = custom(FPC_LETTER_TEMPLATE_KEY);
  const psf = custom(PSF_LETTER_TEMPLATE_KEY);
  return {
    fpcLetterTemplate: fpc ?? DEFAULT_FPC_LETTER_TEMPLATE,
    fpcLetterIsDefault: fpc === null,
    fpcLetterPlaceholders: [...FPC_LETTER_PLACEHOLDERS],
    psfLetterTemplate: psf ?? DEFAULT_PSF_LETTER_TEMPLATE,
    psfLetterIsDefault: psf === null,
    psfLetterPlaceholders: [...PSF_LETTER_PLACEHOLDERS],
  };
}

async function saveTemplate(db: ReportDb, key: string, template: string | null | undefined, allowed: readonly string[], userId: string) {
  if (template === undefined) return;
  if (template === null) {
    await db.reportSetting.deleteMany({ where: { key } });
    return;
  }
  const unknown = unknownPlaceholders(template, allowed);
  if (unknown.length) throw new BadRequestError(`Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${unknown.map((name) => `{{${name}}}`).join(', ')}`);
  await db.reportSetting.upsert({ where: { key }, create: { key, value: template, updatedById: userId }, update: { value: template, updatedById: userId } });
}

export async function saveReportSettings(db: ReportDb, input: z.infer<typeof saveSettingsSchema>['body'], userId: string) {
  await saveTemplate(db, FPC_LETTER_TEMPLATE_KEY, input.fpcLetterTemplate, FPC_LETTER_PLACEHOLDERS, userId);
  await saveTemplate(db, PSF_LETTER_TEMPLATE_KEY, input.psfLetterTemplate, PSF_LETTER_PLACEHOLDERS, userId);
  return getReportSettings(db);
}
