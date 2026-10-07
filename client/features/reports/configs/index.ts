import type { ReportConfig } from "../types";
import { FRONT_OFFICE_CONFIGS } from "./front-office";
import { VEHICLE_ANALYSIS_CONFIGS } from "./vehicle-analysis";
import { WORKSHOP_CONFIGS } from "./workshop";

/** Every workshop report screen, keyed by slug (= route /reports/<slug> = API /reports/<slug>). */
export const REPORT_CONFIGS: ReportConfig[] = [...FRONT_OFFICE_CONFIGS, ...WORKSHOP_CONFIGS, ...VEHICLE_ANALYSIS_CONFIGS];

export function findReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
