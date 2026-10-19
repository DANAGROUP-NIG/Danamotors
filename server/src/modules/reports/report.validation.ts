import { z } from 'zod';
const bool = z.enum(['true', 'false']).default('false');
const ids = z.string().max(4000).transform(s => s.split(',')).pipe(z.array(z.string().uuid()).min(1).max(100)).optional();
const common = { branchId: z.string().uuid().optional(), from: z.string().date(), to: z.string().date() };
const range = <T extends z.ZodRawShape>(fields: T) => z.object({ ...common, ...fields }).strict().superRefine((v, ctx) => {
    const days = (Date.parse(String(v.to)) - Date.parse(String(v.from))) / 86400000;
    if (days < 0 || days > 365)
        ctx.addIssue({ code: 'custom', path: ['to'], message: 'Choose an ordered date range of at most 366 days' });
});
export const reportQueries = {
    'delivered-model': range({ modelIds: ids, detail: bool }),
    'delivered-service': range({ detail: bool }),
    'warranty-attended': range({ warranty: z.enum(['UNDER', 'BEYOND', 'BOTH']).default('BOTH'), printAddress: bool }),
    'warranty-parts': range({ modelIds: ids, variantIds: ids, serviceTypeIds: ids, teamIds: ids, engineerIds: ids, technicianIds: ids, vehicleIds: ids, category: z.enum(['SPARES', 'OIL', 'ACCESSORIES', 'ALL']).default('ALL'), claims: z.enum(['GENERATED', 'NOT_GENERATED', 'ALL']).default('ALL'), billedOnly: bool }),
    'booked-vs-availed': range({ graceDays: z.coerce.number().int().min(0).max(365).default(0) }),
    'estimate-vs-job': range({ basedOn: z.enum(['ESTIMATE', 'JOB']).default('ESTIMATE'), variation: z.enum(['SHORTAGE', 'EXCESS']).default('SHORTAGE') }),
    'unbilled-parts': range({ chargeType: z.enum(['WARRANTY', 'CUSTOMER', 'FREE', 'GOODWILL', 'ALL']).default('ALL'), category: z.enum(['SPARES', 'OIL', 'BOTH']).default('BOTH'), view: z.enum(['DETAIL_SUMMARY', 'SUMMARY', 'DETAIL']).default('DETAIL_SUMMARY') }),
    'tax-register': range({ layout: z.enum(['CATEGORY', 'LEGACY']).default('CATEGORY'), billType: z.enum(['CASH', 'CREDIT', 'BOTH']).default('BOTH'), printAddress: bool, pageBreak: bool, order: z.enum(['NUMBER', 'DATE']).default('NUMBER'), view: z.enum(['DETAIL_ANNEXURE', 'DETAIL', 'ANNEXURE']).default('DETAIL_ANNEXURE') }),
    'corporate-bills': range({ fromCorporateId: z.string().uuid().optional(), toCorporateId: z.string().uuid().optional(), order: z.enum(['CODE', 'NAME']).default('CODE'), billType: z.enum(['CASH', 'CREDIT', 'BOTH']).default('BOTH') }),
    'vehicle-history-card': z.object({ branchId: z.string().uuid().optional(), vehicleId: z.string().uuid().optional(), customerName: z.string().trim().max(100).optional(), registration: z.string().trim().max(100).optional(), product: z.string().trim().max(100).optional(), model: z.string().trim().max(100).optional(), variant: z.string().trim().max(100).optional(), vin: z.string().trim().max(100).optional(), parts: z.enum(['true', 'false']).default('true'), labour: z.enum(['true', 'false']).default('true'), demands: z.enum(['true', 'false']).default('true'), includePdi: bool }).strict(),
};
export type ReportInput = {
    branchId?: string;
    from?: string;
    to?: string;
    [key: string]: unknown;
};
export const selectionQuery = z.object({ branchId: z.string().uuid().optional() }).strict();
