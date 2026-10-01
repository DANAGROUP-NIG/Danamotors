"use client";

import { useParams } from "next/navigation";
import { CampaignDetail } from "@/features/campaigns/components/CampaignDetail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <CampaignDetail id={id} />;
}
