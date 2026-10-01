import { PageHeader } from "@/components/headers/page-header";
import { CampaignForm } from "@/features/campaigns/components/CampaignForm";

export const metadata = { title: "New Campaign - Dana Motors Limited" };

export default function Page() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="New Campaign" description="Define the campaign, then add the affected vehicles." />
      <CampaignForm />
    </div>
  );
}
