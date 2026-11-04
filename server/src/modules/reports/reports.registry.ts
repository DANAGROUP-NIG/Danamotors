import type { ReportDefinition } from './core/types';
import { FPC_REPORTS } from './fpc.reports';
import { MIS_LIST_REPORTS } from './mis/mis-lists.reports';
import { MIS_MANAGEMENT_REPORTS } from './mis/mis-management.report';
import { MIS_SUMMARY_REPORTS } from './mis/mis-summary.reports';
import { MIS_WORKSHOP_REPORTS } from './mis/mis-workshop.reports';

/**
 * Every framework report (#75). Routes, permission checks, validation and the API docs are
 * all generated from this list, so adding a report is one entry here.
 */
export const REPORTS: ReportDefinition[] = [...FPC_REPORTS, ...MIS_SUMMARY_REPORTS, ...MIS_WORKSHOP_REPORTS, ...MIS_LIST_REPORTS, ...MIS_MANAGEMENT_REPORTS];
