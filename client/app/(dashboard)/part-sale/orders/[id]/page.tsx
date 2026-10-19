"use client";

import { useParams } from "next/navigation";
import { OrderDetail } from "@/features/part-sale";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <OrderDetail id={id} />;
}
