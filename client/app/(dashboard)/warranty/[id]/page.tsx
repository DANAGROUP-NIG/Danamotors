"use client";

import { useParams } from "next/navigation";
import { WarrantyCaseDetail } from "@/features/warranty/components/WarrantyCaseDetail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <WarrantyCaseDetail id={id} />;
}
