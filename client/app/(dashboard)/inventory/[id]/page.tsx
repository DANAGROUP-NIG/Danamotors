"use client";

import { useParams } from "next/navigation";
import { PartDetail } from "@/features/inventory";

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <PartDetail id={id} />;
}
