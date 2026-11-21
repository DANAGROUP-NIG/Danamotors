import { FollowUpWorkbench } from "@/features/csc";

export const metadata = { title: "Vehicles not visited after due date - Dana Motors Limited" };

export default function Page() {
  return <FollowUpWorkbench stage="NOT_VISITED" />;
}
