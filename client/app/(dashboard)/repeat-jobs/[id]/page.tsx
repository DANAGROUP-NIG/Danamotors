"use client";

import { useParams } from "next/navigation";
import { RepeatReviewPage } from "@/features/repeat-jobs";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <RepeatReviewPage id={id} />;
}
