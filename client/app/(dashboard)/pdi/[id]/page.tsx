"use client";

import { useParams } from "next/navigation";
import { PdiDetailPage } from "@/features/pdi";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PdiDetailPage id={id} />;
}
