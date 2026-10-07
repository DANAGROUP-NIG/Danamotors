import type { ReportDefinition } from './core/types';
import { FRONT_OFFICE_REPORTS } from './front-office.reports';
import { PRODUCTIVITY_REPORTS } from './productivity.reports';
import { VEHICLE_ANALYSIS_REPORTS } from './vehicle-analysis.reports';
import { WORKSHOP_REPORTS } from './workshop.reports';

/**
 * Every workshop report. Routes, permission checks, validation and the API docs are all
 * generated from this list, so adding a report is one entry here.
 */
export const REPORTS: ReportDefinition[] = [...FRONT_OFFICE_REPORTS, ...WORKSHOP_REPORTS, ...PRODUCTIVITY_REPORTS, ...VEHICLE_ANALYSIS_REPORTS];
