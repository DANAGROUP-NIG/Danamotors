"use client";

import { useParams } from "next/navigation";
import { BranchDetailPage } from "@/features/branches/components/branch-detail-page";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <BranchDetailPage id={id} />;
}
