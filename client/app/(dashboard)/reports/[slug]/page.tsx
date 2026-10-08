"use client";

import { Suspense } from "react";
import { notFound, useParams } from "next/navigation";
import { findReportConfig, ReportRunner } from "@/features/reports";

export default function Page() {
  const { slug } = useParams<{ slug: string }>();
  const config = findReportConfig(slug);
  if (!config) notFound();
  return (
    <Suspense fallback={null}>
      <ReportRunner key={config.slug} config={config} />
    </Suspense>
  );
}
