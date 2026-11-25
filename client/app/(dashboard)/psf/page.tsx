import { Suspense } from "react";
import { PsfWorkbench } from "@/features/psf";

export const metadata = { title: "Post-service follow-up - Dana Motors Limited" };

export default function Page() {
  return (
    <Suspense>
      <PsfWorkbench />
    </Suspense>
  );
}
