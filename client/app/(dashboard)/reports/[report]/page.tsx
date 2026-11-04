import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MonthlyReportPage } from "@/features/reports/components/monthly-report-page";
import { FrameworkReportPage } from "@/features/reports/components/FrameworkReportPage";
import { MONTHLY_REPORTS } from "@/features/reports/monthly-config";
import { REPORT_CONFIGS } from "@/features/reports/configs";

export default async function Page({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const monthly = MONTHLY_REPORTS.find((r) => r.slug === report);
  if (monthly)
    return (
      <Suspense fallback={<p className="p-8">Loading report…</p>}>
        <MonthlyReportPage slug={monthly.slug} />
      </Suspense>
    );
  if (!REPORT_CONFIGS.some((r) => r.slug === report)) notFound();
  return (
    <Suspense fallback={<p className="p-8">Loading report…</p>}>
      <FrameworkReportPage slug={report} />
    </Suspense>
  );
}
