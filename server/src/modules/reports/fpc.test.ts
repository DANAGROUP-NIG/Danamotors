import { CampaignVehicleStatus } from '@prisma/client';
import {
  addFpcFacts,
  emptyFpcCounts,
  fpcPercent,
  fpcRowsFor,
  fpcShowCounts,
  mergeFpcCounts,
  NOT_ANSWERED,
  reasonsText,
  type FpcVehicleFacts,
  type FpcVisit,
} from './fpc.logic';
import { analysisColumns, compareFpcRows } from './fpc.reports';
import { DEFAULT_FPC_LETTER_TEMPLATE, unknownPlaceholders } from './settings';

const day = (d: string) => new Date(`${d}T10:00:00Z`);
const visit = (jobNumber: string, jobDate: string, attended: boolean | null, extra: Partial<FpcVisit> = {}): FpcVisit => ({
  jobId: `job-${jobNumber}`,
  jobNumber,
  jobDate: day(jobDate),
  billedAt: day(jobDate),
  attended,
  notAttendedReason: attended === false ? 'Parts not available' : null,
  ...extra,
});
const facts = (over: Partial<FpcVehicleFacts> = {}): FpcVehicleFacts => ({
  status: CampaignVehicleStatus.PENDING,
  campaignActive: true,
  contactDates: [],
  visits: [],
  ...over,
});

// The integration-test scenario: a range of three VINs; one called by letter; two job cards.
const notCalledNotVisited = facts();
const calledOnly = facts({ contactDates: [day('2026-10-01')] });
const visitedNotAttended = facts({ status: CampaignVehicleStatus.CONTACTED, visits: [visit('J1', '2026-10-05', false)] });
const attendedAfterCall = facts({ status: CampaignVehicleStatus.COMPLETED, contactDates: [day('2026-10-01')], visits: [visit('J2', '2026-10-06', true)] });
const attendedWalkIn = facts({ status: CampaignVehicleStatus.COMPLETED, contactDates: [day('2026-10-09')], visits: [visit('J3', '2026-10-07', true)] });
const notApplicable = facts({ status: CampaignVehicleStatus.NOT_APPLICABLE });

describe('F1 selections', () => {
  it('to be called: outstanding vehicles of active campaigns', () => {
    expect(fpcRowsFor('TO_BE_CALLED', notCalledNotVisited)).toEqual([null]);
    expect(fpcRowsFor('TO_BE_CALLED', calledOnly)).toEqual([null]);
    expect(fpcRowsFor('TO_BE_CALLED', attendedAfterCall)).toEqual([]);
    expect(fpcRowsFor('TO_BE_CALLED', notApplicable)).toEqual([]);
    expect(fpcRowsFor('TO_BE_CALLED', facts({ campaignActive: false }))).toEqual([]);
  });

  it('called but not visited: a contact and no job card', () => {
    expect(fpcRowsFor('CALLED_NOT_VISITED', calledOnly)).toEqual([null]);
    expect(fpcRowsFor('CALLED_NOT_VISITED', notCalledNotVisited)).toEqual([]);
    expect(fpcRowsFor('CALLED_NOT_VISITED', attendedAfterCall)).toEqual([]);
  });

  it('visited but not attended: one row per visit, none attended', () => {
    const twice = facts({ visits: [visit('J4', '2026-10-01', null), visit('J5', '2026-10-08', false)] });
    expect(fpcRowsFor('VISITED_NOT_ATTENDED', twice).map((v) => v?.jobNumber)).toEqual(['J4', 'J5']);
    expect(fpcRowsFor('VISITED_NOT_ATTENDED', visitedNotAttended)).toHaveLength(1);
    expect(fpcRowsFor('VISITED_NOT_ATTENDED', attendedAfterCall)).toEqual([]);
    expect(fpcRowsFor('VISITED_NOT_ATTENDED', calledOnly)).toEqual([]);
  });

  it('attended: the attended job card', () => {
    expect(fpcRowsFor('ATTENDED', attendedAfterCall).map((v) => v?.jobNumber)).toEqual(['J2']);
    expect(fpcRowsFor('ATTENDED', visitedNotAttended)).toEqual([]);
  });

  it('attended but not called: no contact before the job card was opened', () => {
    expect(fpcRowsFor('ATTENDED_NOT_CALLED', attendedWalkIn).map((v) => v?.jobNumber)).toEqual(['J3']);
    expect(fpcRowsFor('ATTENDED_NOT_CALLED', attendedAfterCall)).toEqual([]);
  });

  it('counts every list for the summary tiles', () => {
    expect(fpcShowCounts([notCalledNotVisited, calledOnly, visitedNotAttended, attendedAfterCall, attendedWalkIn, notApplicable])).toEqual({
      TO_BE_CALLED: 3,
      CALLED_NOT_VISITED: 1,
      VISITED_NOT_ATTENDED: 1,
      ATTENDED: 2,
      ATTENDED_NOT_CALLED: 1,
    });
  });
});

describe('F2 analysis', () => {
  const all = [notCalledNotVisited, calledOnly, visitedNotAttended, attendedAfterCall, attendedWalkIn, notApplicable];
  const october = (v: FpcVisit) => v.billedAt !== null && v.billedAt >= day('2026-10-01') && v.billedAt < day('2026-11-01');

  it('counts affected, called, visits in the period, attended, reasons and outstanding', () => {
    const counts = all.reduce((c, f) => addFpcFacts(c, f, october), emptyFpcCounts());
    expect(counts).toEqual({
      affected: 5,
      called: 3,
      visited: 3,
      attended: 2,
      notAttended: 1,
      reasons: { 'Parts not available': 1 },
      attendedToDate: 2,
      outstanding: 3,
    });
    // visited = visited not attended + attended, as in F1
    expect(counts.visited).toBe(counts.attended + counts.notAttended);
  });

  it('only counts visits billed in the period; unbilled and unanswered visits are handled', () => {
    const unbilled = facts({ visits: [visit('J6', '2026-10-02', true, { billedAt: null })] });
    const unanswered = facts({ visits: [visit('J7', '2026-10-03', null)] });
    const counts = [unbilled, unanswered].reduce((c, f) => addFpcFacts(c, f, october), emptyFpcCounts());
    expect(counts.visited).toBe(1);
    expect(counts.attendedToDate).toBe(1);
    expect(counts.reasons).toEqual({ [NOT_ANSWERED]: 1 });
  });

  it('works out percentages from the counts, also for merged totals', () => {
    const counts = all.reduce((c, f) => addFpcFacts(c, f, october), emptyFpcCounts());
    expect(analysisColumns(counts)).toMatchObject({ attendedPctVisited: 66.7, attendedPctAffected: 40, reasons: 'Parts not available 1' });
    const merged = mergeFpcCounts(mergeFpcCounts(emptyFpcCounts(), counts), counts);
    expect(analysisColumns(merged)).toMatchObject({ affected: 10, attendedPctVisited: 66.7 });
    expect(fpcPercent(1, 0)).toBeNull();
    expect(reasonsText({ 'Customer declined': 1, 'Parts not available': 3 })).toBe('Parts not available 3, Customer declined 1');
  });
});

describe('F1 order', () => {
  const rows = [
    { model: 'Sportage', variant: 'EX', registration: 'B-2', vin: 'V3' },
    { model: null, variant: null, registration: null, vin: 'V1' },
    { model: 'Rio', variant: 'LX', registration: 'A-10', vin: 'V2' },
    { model: 'Rio', variant: 'EX', registration: 'A-9', vin: 'V4' },
  ];
  it('sorts by the chosen keys with unregistered vehicles last', () => {
    expect([...rows].sort(compareFpcRows('MODEL')).map((r) => r.vin)).toEqual(['V4', 'V2', 'V3', 'V1']);
    expect([...rows].sort(compareFpcRows('REGISTRATION')).map((r) => r.vin)).toEqual(['V4', 'V2', 'V3', 'V1']);
    expect([...rows].sort(compareFpcRows('VIN')).map((r) => r.vin)).toEqual(['V1', 'V2', 'V3', 'V4']);
  });
});

describe('FPC letter template', () => {
  it('accepts the default and flags unknown placeholders', () => {
    expect(unknownPlaceholders(DEFAULT_FPC_LETTER_TEMPLATE)).toEqual([]);
    expect(unknownPlaceholders('Dear {{customer}}, {{ phone }} {{phone}} {{vin}}')).toEqual(['phone']);
  });
});
