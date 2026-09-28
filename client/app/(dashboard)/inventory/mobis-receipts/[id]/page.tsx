"use client";

import { useParams } from "next/navigation";
import { MitDetail } from "@/features/mobis-receipts";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <MitDetail id={id} />;
}
