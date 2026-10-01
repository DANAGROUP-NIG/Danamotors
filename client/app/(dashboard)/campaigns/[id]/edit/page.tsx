"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/headers/page-header";
import { PageState } from "@/features/warranty/components/ui";
import { CampaignForm } from "@/features/campaigns/components/CampaignForm";
import { useCampaign } from "@/features/campaigns/hooks/use-campaigns";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useCampaign(id);
  if (isLoading) return <PageState loading />;
  if (isError || !data) return <PageState message="Campaign not found." />;
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title={`Edit ${data.code}`} description={data.title} />
      <CampaignForm campaign={data} />
    </div>
  );
}
