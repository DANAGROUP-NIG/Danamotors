"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import ModalFame from "@/components/modals/ModalFame";
import { useBranches } from "../hooks/use-branches";
import { BranchCreateForm } from "./BranchCreateForm";
import { BranchesTable } from "./BranchesTable";

export function BranchesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data } = useBranches({ page: 1, limit: 1 });

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Branches"
        description={
          data?.meta?.total != null
            ? `${data.meta.total} ${data.meta.total === 1 ? "branch" : "branches"} on record`
            : undefined
        }
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="size-4" />
            Add branch
          </Button>
        }
      />

      <ModalFame
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add branch"
      >
        <BranchCreateForm onSuccess={() => setShowForm(false)} />
      </ModalFame>
      <BranchesTable />
    </div>
  );
}
