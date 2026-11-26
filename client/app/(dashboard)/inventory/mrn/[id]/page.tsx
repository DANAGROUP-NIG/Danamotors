"use client";

import { useParams } from "next/navigation";
import { VendorReceiptDetail } from "@/features/vendor-receipts";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <VendorReceiptDetail id={id} />;
}
