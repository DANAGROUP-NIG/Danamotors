"use client";

import { useParams } from "next/navigation";
import { PdiBillPage } from "@/features/pdi";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PdiBillPage jobId={id} />;
}
