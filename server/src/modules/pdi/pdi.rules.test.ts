import { ChargeType, JobCardType, WarrantyCoverageStatus } from '@prisma/client';
import { assertChargeChange } from '../job-card-line/jobCardLine.logic';
import { pdiBillExcluded, pdiLedgerFor } from '../finance/tally.service';
import { assertJobTypeAccess } from './pdi.logic';

const change = { kind: 'PART' as const, coverageAtCreation: WarrantyCoverageStatus.NOT_COVERED, hasWarrantyCase: false, partWarrantyApplicable: true, linkedCampaignIds: [] as string[], canChargeGoodwill: false };

describe('PDI charge types', () => {
  it('allows warranty on a PDI job without a warranty case, but not on a service job', () => {
    expect(() => assertChargeChange({ ...change, to: ChargeType.WARRANTY, pdi: true })).not.toThrow();
    expect(() => assertChargeChange({ ...change, to: ChargeType.WARRANTY })).toThrow('warranty case');
  });
  it('still needs a warranty-applicable part', () => {
    expect(() => assertChargeChange({ ...change, to: ChargeType.WARRANTY, pdi: true, partWarrantyApplicable: false })).toThrow('not warranty-applicable');
  });
  it('allows dealer-borne FOC on a PDI job without a campaign', () => {
    expect(assertChargeChange({ ...change, to: ChargeType.FREE, pdi: true })).toEqual({ campaignId: null });
    expect(() => assertChargeChange({ ...change, to: ChargeType.FREE })).toThrow('campaign');
  });
  it('keeps campaign FOC on a PDI job when a campaign is linked', () => {
    expect(assertChargeChange({ ...change, to: ChargeType.FREE, pdi: true, linkedCampaignIds: ['c1'] })).toEqual({ campaignId: 'c1' });
    expect(() => assertChargeChange({ ...change, to: ChargeType.FREE, pdi: true, campaignId: 'other' })).toThrow('not linked');
  });
});

describe('PDI job type access', () => {
  it('needs pdi:update for PDI jobs', () => {
    expect(() => assertJobTypeAccess({ jobType: JobCardType.PDI }, {})).toThrow('pdi:update');
    expect(() => assertJobTypeAccess({ jobType: JobCardType.PDI }, { pdi: true })).not.toThrow();
  });
  it('keeps the PDI routes to PDI jobs', () => {
    expect(() => assertJobTypeAccess({ jobType: JobCardType.SERVICE }, { pdi: true, pdiOnly: true })).toThrow('not a PDI job');
    expect(() => assertJobTypeAccess({ jobType: JobCardType.SERVICE }, {})).not.toThrow();
  });
});

describe('PDI Tally posting', () => {
  const pdi = new Map([['SALES', 'PDI Account'], ['PARTY', 'PDI Party'], ['LABOUR_SALES', 'PDI Labour']]);
  const job = new Map([['VAT', 'VAT Output'], ['ROUND_OFF', 'Round Off'], ['PARTS_SALES', 'Service Parts']]);
  it('posts amounts to PDI ledgers, falling back to the PDI account', () => {
    expect(pdiLedgerFor('LABOUR_SALES', pdi, job)).toBe('PDI Labour');
    expect(pdiLedgerFor('PARTS_SALES', pdi, job)).toBe('PDI Account');
    expect(pdiLedgerFor('PARTS_DISCOUNT', pdi, job)).toBe('PDI Account');
  });
  it('uses the job bill VAT and round-off ledgers unless PDI ones are mapped', () => {
    expect(pdiLedgerFor('VAT', pdi, job)).toBe('VAT Output');
    expect(pdiLedgerFor('VAT', new Map([...pdi, ['VAT', 'PDI VAT']]), job)).toBe('PDI VAT');
  });
  it('leaves out PDI bills when posting is off and zero PDI bills always', () => {
    expect(pdiBillExcluded({ total: 100, jobCard: { jobType: 'PDI' } }, false)).toBe(true);
    expect(pdiBillExcluded({ total: 0, jobCard: { jobType: 'PDI' } }, true)).toBe(true);
    expect(pdiBillExcluded({ total: 100, jobCard: { jobType: 'PDI' } }, true)).toBe(false);
    expect(pdiBillExcluded({ total: 0, jobCard: { jobType: 'SERVICE' } }, false)).toBe(false);
  });
});
