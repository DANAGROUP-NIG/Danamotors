"use client";

import { useParams } from "next/navigation";
import { VendorReturnForm } from "@/features/vendor-receipts";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <VendorReturnForm mrnId={id} />;
}
