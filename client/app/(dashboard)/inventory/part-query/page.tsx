import { Suspense } from "react";
import { PartQueryPage } from "@/features/inventory";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PartQueryPage />
    </Suspense>
  );
}
