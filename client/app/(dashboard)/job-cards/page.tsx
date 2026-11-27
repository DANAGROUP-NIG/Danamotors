import { Suspense } from "react";
import { JobCardsPage } from "@/features/job-cards";

export const metadata = { title: "Job Cards - Dana Motors Limited" };

/** The board and table keep their filters in the address bar, read on the client inside this boundary. */
export default function Page() {
  return (
    <Suspense>
      <JobCardsPage />
    </Suspense>
  );
}
