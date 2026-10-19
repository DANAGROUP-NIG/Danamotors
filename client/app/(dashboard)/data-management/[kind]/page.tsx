"use client";

import { notFound, useParams } from "next/navigation";
import { OrderCancellationPage, isCancellationKind } from "@/features/data-management";

export default function Page() {
  const { kind } = useParams<{ kind: string }>();
  if (!isCancellationKind(kind)) notFound();
  // Remount per screen so filters and ticks reset when switching.
  return <OrderCancellationPage key={kind} kind={kind} />;
}
