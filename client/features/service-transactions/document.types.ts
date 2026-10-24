import type { JobCard } from '@/features/job-cards/types/job-card.types';
export type SlipKind = 'requisitions' | 'return-slips' | 'labour-slips';
export const slipRoutes = { requisitions: '/inventory/requisitions', 'return-slips': '/inventory/return-slips', 'labour-slips': '/service/labour-slips' };
export const slipKeys = { requisitions: 'requisition', 'return-slips': 'returnSlip', 'labour-slips': 'labourSlip' };
export const slipListKeys = { requisitions: 'requisitions', 'return-slips': 'returnSlips', 'labour-slips': 'labourSlips' };
export type ChargeType = 'CUSTOMER' | 'WARRANTY' | 'FREE' | 'GOODWILL';
export type TransactionJob = JobCard;
export type Payer = { chargeType: ChargeType; campaignId?: string; reason?: string };
export type LabourDraft = Payer & { labourItemId: string; chargedHours?: number; technicianId?: string; mechanicId?: string; groupId?: string };
