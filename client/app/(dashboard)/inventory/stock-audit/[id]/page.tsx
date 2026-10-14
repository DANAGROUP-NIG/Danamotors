"use client";

import { useParams } from "next/navigation";
import { StockTakeDetail } from "@/features/stock-taking";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <StockTakeDetail id={id} kind="AUDIT" />;
}
