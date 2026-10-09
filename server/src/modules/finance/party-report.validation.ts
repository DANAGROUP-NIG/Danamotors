import { z } from 'zod';
export const DEFAULT_AGE_LIMITS = [30,60,90,120,180];
export const ageLimitsSchema = z.array(z.number().int().min(1).max(3650)).length(5).refine(v => v.every((n,i) => i===0 || n>v[i-1]),'Enter five increasing age limits');
export const partyReportQuery = z.object({
  kind: z.enum(['ledger','outstanding','age','bill']).default('outstanding'),
  branchId: z.string().uuid().optional(), customerId: z.string().uuid().optional(),
  fromCustomerId: z.string().uuid().optional(), toCustomerId: z.string().uuid().optional(),
  order: z.enum(['name','code']).default('name'), partyStatus: z.enum(['ALL','CUSTOMER','DEALER','FA_PARTY']).default('ALL'),
  side: z.literal('DEBTORS').default('DEBTORS'),
  from: z.string().date().optional(), to: z.string().date().optional(), asOn: z.string().date().optional(),
  showCredit: z.enum(['true','false']).default('false'),
  ageLimits: z.union([z.string().transform(v => v.split(',').map(Number)),ageLimitsSchema]).pipe(ageLimitsSchema).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict().superRefine((v,ctx) => {
  if(v.kind==='ledger' && (!v.from || !v.to)) ctx.addIssue({code:'custom',path:['from'],message:'Ledger requires both dates'});
  if(v.kind!=='ledger' && !v.asOn) ctx.addIssue({code:'custom',path:['asOn'],message:'Choose an as-on date'});
  if(v.from && v.to && v.from>v.to) ctx.addIssue({code:'custom',path:['to'],message:'End date must follow start date'});
  if((v.asOn || v.to || '')>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) ctx.addIssue({code:'custom',path:['asOn'],message:'Future report dates are unavailable'});
});
export const partyReportSchema = z.object({query: partyReportQuery});
export const reportSettingsSchema = z.object({body:z.object({ageLimits:ageLimitsSchema}).strict()});
export const reportPartySearchSchema=z.object({query:z.object({kind:z.enum(['ledger','outstanding','age','bill']).optional(),branchId:z.string().uuid().optional(),search:z.string().trim().max(100).default(''),order:z.enum(['name','code']).default('name'),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict()});
export type PartyReportInput=z.infer<typeof partyReportQuery>;
