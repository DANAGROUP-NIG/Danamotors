"use client";

import { useParams } from "next/navigation";
import { PartsReportView } from "@/features/parts-reports";

export default function Page() {
  const { kind } = useParams<{ kind: string }>();
  // Remount per report so filters reset when switching reports.
  return <PartsReportView key={kind} kind={kind} />;
}
