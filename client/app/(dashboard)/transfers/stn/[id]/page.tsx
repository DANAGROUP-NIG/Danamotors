"use client";

import { useParams } from "next/navigation";
import { StnDetail } from "@/features/stock-transfers";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <StnDetail id={id} />;
}
