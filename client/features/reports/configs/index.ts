import type { ReportConfig } from "../types";
import { WORKSHOP_CONFIGS } from "./workshop";

/** Every workshop report screen, keyed by slug (= route /reports/<slug> = API /reports/<slug>). */
export const REPORT_CONFIGS: ReportConfig[] = [...WORKSHOP_CONFIGS];

export function findReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
