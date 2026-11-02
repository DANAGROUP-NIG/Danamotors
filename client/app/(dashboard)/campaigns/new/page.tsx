import { PageHeader } from "@/components/headers/page-header";
import { CampaignForm } from "@/features/campaigns/components/CampaignForm";

export const metadata = { title: "New Campaign - Dana Motors Limited" };

export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  // /campaigns/new?type=FPC (from "FPC bulletins") starts an FPC bulletin.
  const fpc = (await searchParams).type === "FPC";
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title={fpc ? "New FPC Bulletin" : "New Campaign"}
        description={fpc ? "Enter the manufacturer's bulletin, then the VIN ranges to check." : "Define the campaign, then add the affected vehicles."}
      />
      <CampaignForm defaultType={fpc ? "FPC" : "RECALL"} />
    </div>
  );
}
