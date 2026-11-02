"use client";

import { notFound } from "next/navigation";
import { findReportConfig } from "../configs";
import { ReportRunner } from "./ReportRunner";

/** A framework report (#75) screen. Configs hold render functions, so they are looked up on the client. */
export function FrameworkReportPage({ slug }: { slug: string }) {
  const config = findReportConfig(slug);
  if (!config) notFound();
  return <ReportRunner key={config.slug} config={config} />;
}
