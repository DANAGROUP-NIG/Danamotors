"use client";

import { useParams } from "next/navigation";
import { ChallanDetail } from "@/features/dispatch-challans";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ChallanDetail id={id} />;
}
