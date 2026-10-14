import { Suspense } from "react";
import { CounterSaleCreateForm } from "@/features/part-sale";

export default function Page() {
  // The form reads ?orderId= when opened from a CPO.
  return (
    <Suspense>
      <CounterSaleCreateForm />
    </Suspense>
  );
}
