"use client";
import { useParams } from "next/navigation";
import { JobWorkspace } from "@/features/job-cards/components/workspace/JobWorkspace";

export default function JobCardPage() {
  const { id } = useParams<{ id: string }>();
  return <JobWorkspace id={id} />;
}
