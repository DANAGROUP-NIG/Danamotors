import type { ReportDefinition } from './core/types';
import { FPC_REPORTS } from './fpc.reports';

/**
 * Every framework report (#75). Routes, permission checks, validation and the API docs are
 * all generated from this list, so adding a report is one entry here.
 */
export const REPORTS: ReportDefinition[] = [...FPC_REPORTS];
