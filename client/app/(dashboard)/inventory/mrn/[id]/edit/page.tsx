"use client";

import { useParams } from "next/navigation";
import { VendorReceiptEdit } from "@/features/vendor-receipts";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <VendorReceiptEdit id={id} />;
}
