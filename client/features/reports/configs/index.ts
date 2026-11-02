import type { ReportConfig } from "../types";
import { FPC_CONFIGS } from "./fpc";

/** Every framework report screen (#75), keyed by slug (= route /reports/<slug> = API /reports/<slug>). */
export const REPORT_CONFIGS: ReportConfig[] = [...FPC_CONFIGS];

export function findReportConfig(slug: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((config) => config.slug === slug);
}
