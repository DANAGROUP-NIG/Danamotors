"use client";

import { useParams } from "next/navigation";
import { CounterSaleDetail } from "@/features/part-sale";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <CounterSaleDetail id={id} />;
}
