import type { ReportConfig } from "../types";
import { FPC_CONFIGS } from "./fpc";
import { MIS_LIST_CONFIGS } from "./mis-lists";
import { MIS_MANAGEMENT_CONFIGS } from "./mis-management";
import { MIS_SUMMARY_CONFIGS } from "./mis-summary";
import { MIS_WORKSHOP_CONFIGS } from "./mis-workshop";

/** Every framework report screen (#75), keyed by slug (= route /reports/<slug> = API /reports/<slug>). */
export const REPORT_CONFIGS: ReportConfig[] = [...FPC_CONFIGS, ...MIS_SUMMARY_CONFIGS, ...MIS_WORKSHOP_CONFIGS, ...MIS_LIST_CONFIGS, ...MIS_MANAGEMENT_CONFIGS];

export function findReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
