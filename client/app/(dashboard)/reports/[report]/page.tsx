import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MonthlyReportPage } from "@/features/reports/components/monthly-report-page";
import { MONTHLY_REPORTS } from "@/features/reports/monthly-config";
export default async function Page({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const config = MONTHLY_REPORTS.find((r) => r.slug === report);
  if (!config) notFound();
  return (
    <Suspense fallback={<p className="p-8">Loading report…</p>}>
      <MonthlyReportPage slug={config.slug} />
    </Suspense>
  );
}
