import type { ReportConfig } from "../types";

/** Every framework report screen (#75), keyed by slug (= route /reports/<slug> = API /reports/<slug>). */
export const REPORT_CONFIGS: ReportConfig[] = [];

export function findReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
