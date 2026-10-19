"use client";

import { useParams } from "next/navigation";
import { CountSheetForm } from "@/features/stock-taking";

export default function Page() {
  const { id, sheetId } = useParams<{ id: string; sheetId: string }>();
  return <CountSheetForm id={id} sheetId={sheetId} />;
}
