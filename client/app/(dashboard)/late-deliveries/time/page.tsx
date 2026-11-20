import { Suspense } from "react";
import { LateDeliveryWorkbench } from "@/features/late-deliveries";

export const metadata = { title: "Promise time details - Dana Motors Limited" };

export default function Page() {
  return (
    <Suspense>
      <LateDeliveryWorkbench kind="TIME" />
    </Suspense>
  );
}
