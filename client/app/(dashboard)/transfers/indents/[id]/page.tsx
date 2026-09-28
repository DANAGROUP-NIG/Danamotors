"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { IndentDetail } from "@/features/stock-transfers";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <IndentDetail id={id} />
    </Suspense>
  );
}
