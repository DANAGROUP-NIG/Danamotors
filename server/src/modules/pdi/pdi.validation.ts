import { z } from 'zod';
import { MAX_MILEAGE } from '../warranty/warranty.logic';
import { PDI_BILL_TYPES } from './pdi.logic';

const id = z.string().uuid();
const amount = z.number().min(0).max(1e12).multipleOf(0.01);
const mileage = z.number().int('Mileage must be a whole number').min(0, 'Mileage cannot be negative').max(MAX_MILEAGE);
const day = z.string().date();
const text = (max: number) => z.string().trim().max(max);

export const pdiDefectLine = z.object({
  defectId: id.optional(),
  description: text(2000).optional(),
  spare: amount.optional(),
  oil: amount.optional(),
  labour: amount.optional(),
}).strict().refine(row => !!row.defectId || !!row.description, 'Choose a PDI defect or describe it');

const tyre = z.object({ makeId: id.optional(), number: text(100).toUpperCase().optional() }).strict();

export const pdiOpenBody = z.object({
  branchId: id,
  vehicleId: id,
  /** Defaults to the PDI customer in PDI settings (the dealership or a transit account). */
  customerId: id.optional(),
  serviceTypeId: id,
  mileage,
  /** Defaults to the last 6 characters of the VIN. */
  pdiRegistration: text(20).toUpperCase().min(1).optional(),
  bayId: id,
  serviceAdvisorId: id,
  engineerId: id,
  teamId: id.optional(),
  technicianId: id.optional(),
  promisedAt: z.string().datetime(),
  description: text(5000).optional(),
  remarks: text(5000).optional(),
  acType: z.enum(['FACTORY', 'DEALER', 'NONE']).optional(),
  defects: z.array(pdiDefectLine).min(1, 'Add at least one defect line').max(100),
  tyres: z.array(tyre).max(5).optional(),
  batteryMakeId: id.optional(),
  batteryNumber: text(100).toUpperCase().optional(),
  acknowledgedCampaignIds: z.array(id).max(50).optional(),
}).strict().refine(input => !!input.teamId || !!input.technicianId, { message: 'Select a group or a technician', path: ['teamId'] });
export type PdiOpenInput = z.infer<typeof pdiOpenBody>;

export const pdiUpdateBody = z.object({
  pdiRegistration: text(20).toUpperCase().min(1).optional(),
  mileage: mileage.optional(),
  bayId: id.optional(),
  engineerId: id.optional(),
  teamId: id.nullable().optional(),
  technicianId: id.nullable().optional(),
  promisedAt: z.string().datetime().optional(),
  remarks: text(5000).nullable().optional(),
  defects: z.array(pdiDefectLine).min(1, 'Add at least one defect line').max(100).optional(),
  tyres: z.array(tyre).max(5).optional(),
  batteryMakeId: id.nullable().optional(),
  batteryNumber: text(100).toUpperCase().nullable().optional(),
}).strict().refine(input => Object.keys(input).length > 0, 'Nothing to update');
export type PdiUpdateInput = z.infer<typeof pdiUpdateBody>;

export const pdiVehicleBody = z.object({
  vin: text(50).toUpperCase().min(11, 'Enter the full VIN'),
  catalogueId: id,
  colourId: id,
  engineNumber: text(100).toUpperCase().min(1, 'Enter the engine number'),
  acType: z.enum(['FACTORY', 'DEALER', 'NONE']).optional(),
  manufactureMonth: z.number().int().min(1).max(12).optional(),
  manufactureYear: z.number().int().min(1900).max(2200).optional(),
  keyNumber: text(100).optional(),
}).strict();
export type PdiVehicleInput = z.infer<typeof pdiVehicleBody>;

export const listPdiSchema = z.object({ query: z.object({
  branchId: id.optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'QC', 'READY', 'BILLED', 'DELIVERED', 'CANCELLED']).optional(),
  vin: text(50).optional(),
  search: text(100).optional(),
  dateFrom: day.optional(),
  dateTo: day.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict() });
export type PdiListQuery = z.infer<typeof listPdiSchema>['query'];

export const pdiDocumentListSchema = z.object({ query: z.object({
  branchId: id.optional(),
  jobCardId: id.optional(),
  search: text(100).optional(),
  dateFrom: day.optional(),
  dateTo: day.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict() });
export type PdiDocumentListQuery = z.infer<typeof pdiDocumentListSchema>['query'];

export const pdiIdSchema = z.object({ params: z.object({ id }) });
export const pdiOpenSchema = z.object({ body: pdiOpenBody });
export const pdiUpdateSchema = z.object({ params: z.object({ id }), body: pdiUpdateBody });
export const pdiVehicleSchema = z.object({ body: pdiVehicleBody });
export const pdiVinSchema = z.object({ query: z.object({ vin: text(50).toUpperCase().min(3) }).strict() });
export const pdiOptionsSchema = z.object({ query: z.object({ vehicleId: id, date: day.optional() }).strict() });
export const pdiDefectSearchSchema = z.object({ query: z.object({
  search: text(100).optional(), vehicleId: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict() });
export const pdiWorkDoneSchema = z.object({ params: z.object({ id }), body: z.object({ workDone: text(5000).optional() }).strict() });
export const pdiReadySchema = z.object({ params: z.object({ id }), body: z.object({ remarks: text(2000).optional() }).strict() });
export const pdiCancelSchema = z.object({ params: z.object({ id }), body: z.object({ reason: text(2000).min(1, 'Give a reason') }).strict() });
export const pdiPrintSchema = z.object({ params: z.object({
  kind: z.enum(['job', 'requisition', 'return', 'labour', 'bill']),
  id,
}) });

const discount = z.number().min(0).max(100).multipleOf(0.01);
export const pdiBillPreviewBody = z.object({
  jobCardId: id,
  partsDiscountPercent: discount.default(0),
  labourDiscountPercent: discount.default(0),
}).strict();
export const pdiBillBody = pdiBillPreviewBody.extend({
  billType: z.enum(PDI_BILL_TYPES),
  deliveryAdvisorId: id,
  creditCompany: text(200).optional(),
  cardNumber: text(50).optional(),
  remarks: text(2000).optional(),
}).strict();
export type PdiBillPreviewInput = z.infer<typeof pdiBillPreviewBody>;
export type PdiBillInput = z.infer<typeof pdiBillBody>;
export const pdiBillPreviewSchema = z.object({ body: pdiBillPreviewBody });
export const pdiBillSchema = z.object({ body: pdiBillBody });
export const pdiBillCancelSchema = z.object({ params: z.object({ id }), body: z.object({ reason: text(2000).min(1, 'Give a reason') }).strict() });

const nullableDay = day.nullable().optional();
export const pdiSettingsBody = z.object({
  jobFreezeDate: nullableDay,
  requisitionFreezeDate: nullableDay,
  returnFreezeDate: nullableDay,
  labourFreezeDate: nullableDay,
  billFreezeDate: nullableDay,
  jobEditBeforePrint: z.boolean().optional(),
  jobEditAfterPrint: z.boolean().optional(),
  requisitionEditBeforePrint: z.boolean().optional(),
  requisitionEditAfterPrint: z.boolean().optional(),
  returnEditBeforePrint: z.boolean().optional(),
  returnEditAfterPrint: z.boolean().optional(),
  labourEditBeforePrint: z.boolean().optional(),
  labourEditAfterPrint: z.boolean().optional(),
  billEditBeforePrint: z.boolean().optional(),
  billEditAfterPrint: z.boolean().optional(),
  roundBill: z.boolean().optional(),
  defaultCustomerId: id.nullable().optional(),
  includeInHistory: z.boolean().optional(),
  postBillsToTally: z.boolean().optional(),
  invoiceTitle: text(60).min(1).optional(),
  cashMemoTitle: text(60).min(1).optional(),
}).strict();
export type PdiSettingsInput = z.infer<typeof pdiSettingsBody>;
export const pdiSettingsSchema = z.object({ body: pdiSettingsBody });
