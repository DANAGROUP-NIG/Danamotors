import { z } from 'zod';
import { partyReportQuery } from './party-report.validation';
import { creditDaysSchema } from './credit-terms';
export const maintenanceFilters = partyReportQuery.innerType().pick({ branchId:true,customerId:true,fromCustomerId:true,toCustomerId:true,order:true,partyStatus:true });
export const repairSchema = z.object({body:maintenanceFilters.extend({previewHash:z.string().length(64).optional()}).strict()});
export const DEFAULT_LETTER_TEMPLATE = 'Dear {{customerName}},\n{{address}}\n\nOur records show a net outstanding balance of NGN {{totalOutstanding}} as on {{asOn}}.\n{{billTable}}\nPlease arrange settlement or contact us to reconcile your account.\n\nYours faithfully,\nDana Motors Accounts';
export const letterTemplateSchema=z.string().trim().min(1).max(10000).superRefine((value,ctx)=>{
 const allowed=['customerName','address','totalOutstanding','asOn','billTable'];
 for(const match of value.matchAll(/{{([^}]+)}}/g))if(!allowed.includes(match[1]))ctx.addIssue({code:'custom',message:'Unknown placeholder: '+match[1]});
 for(const key of allowed)if(!value.includes('{{'+key+'}}'))ctx.addIssue({code:'custom',message:'Include {{'+key+'}}'});
});
export const maintenanceSettingsSchema=z.object({body:z.object({defaultCreditDays:creditDaysSchema,letterPrefix:z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),letterTemplate:letterTemplateSchema}).strict()});
export const letterFilters=maintenanceFilters.extend({asOn:z.string().date(),partyStatus:z.enum(['ALL','CUSTOMER','DEALER']).default('ALL'),threshold:z.coerce.number().finite().min(0).max(999999999999).refine(v=>Number(v.toFixed(2))===v,'Enter an amount with at most two decimal places'),includePrinted:z.boolean().default(false)}).strict().superRefine((v,ctx)=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(v.asOn>today)ctx.addIssue({code:'custom',path:['asOn'],message:'Future letter dates are unavailable'});
});
export const lettersPreviewSchema=z.object({body:letterFilters});
export const lettersGenerateSchema=z.object({body:letterFilters.innerType().extend({idempotencyKey:z.string().uuid(),previewHash:z.string().length(64)}).strict().superRefine((v,ctx)=>{const {idempotencyKey: _key,previewHash: _hash,...filters}=v;const result=letterFilters.safeParse(filters);if(!result.success)for(const issue of result.error.issues)ctx.addIssue(issue);})});
export const savedLettersSchema=z.object({query:z.object({branchId:z.string().uuid().optional(),fromRef:z.string().regex(/^[A-Z0-9]+\d{6}$/).optional(),toRef:z.string().regex(/^[A-Z0-9]+\d{6}$/).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().refine(v=>!v.fromRef||!v.toRef||v.fromRef<=v.toRef,'End reference must follow start reference')});
export const letterPrintSchema=z.object({body:z.object({ids:z.array(z.string().uuid()).min(1).max(100)}).strict()});
export type MaintenanceFilters=z.infer<typeof maintenanceFilters>;
export type LetterFilters=z.infer<typeof letterFilters>;
