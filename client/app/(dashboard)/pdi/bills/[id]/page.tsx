"use client";

import { useParams } from "next/navigation";
import { PdiBillView } from "@/features/pdi";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PdiBillView id={id} />;
}
