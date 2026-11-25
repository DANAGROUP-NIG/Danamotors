"use client";

import { useParams } from "next/navigation";
import { VendorReturnDetail } from "@/features/vendor-receipts";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <VendorReturnDetail id={id} />;
}
