import { Suspense } from "react";
import { CampaignsPage } from "@/features/campaigns/components/campaigns-page";

export const metadata = { title: "Campaigns - Dana Motors Limited" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CampaignsPage />
    </Suspense>
  );
}
