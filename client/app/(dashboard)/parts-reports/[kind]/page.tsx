"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PartsReportView } from "@/features/parts-reports";

function Report() {
  const { kind } = useParams<{ kind: string }>();
  // A link can prefill ?search= and ?branchId=, e.g. from a stock taking.
  const query = useSearchParams();
  const initial = { search: query.get("search") ?? undefined, branchId: query.get("branchId") ?? undefined };
  // Remount per report so filters reset when switching reports.
  return <PartsReportView key={kind} kind={kind} initial={initial} />;
}

export default function Page() {
  return (
    <Suspense>
      <Report />
    </Suspense>
  );
}
