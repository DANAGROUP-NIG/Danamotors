import type { ReportConfig } from "../types";
import { BILLING_CONFIGS } from "./billing";
import { FRONT_OFFICE_CONFIGS } from "./front-office";
import { PRODUCTIVITY_CONFIGS } from "./productivity";
import { VEHICLE_ANALYSIS_CONFIGS } from "./vehicle-analysis";
import { WORKSHOP_CONFIGS } from "./workshop";

/** Every workshop report screen, keyed by slug (= route /reports/<slug> = API /reports/<slug>). */
export const REPORT_CONFIGS: ReportConfig[] = [...FRONT_OFFICE_CONFIGS, ...WORKSHOP_CONFIGS, ...PRODUCTIVITY_CONFIGS, ...BILLING_CONFIGS, ...VEHICLE_ANALYSIS_CONFIGS];

export function findReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
