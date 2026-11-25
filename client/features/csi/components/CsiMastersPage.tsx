"use client";
import { CSI_PERMISSIONS } from "@/features/auth/roles";

import { useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type Column,
} from "@/components/ui/table-components/DataTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import {
  applicabilityLabels,
  type Master,
  type MasterKind,
  useCsiMasters,
} from "../hooks/use-csi-masters";
import { CsiMasterForm } from "./CsiMasterForm";

const masterLabels = {
  attributes: "attribute",
  responses: "response",
  cards: "card",
} as const;

function Pagination({
  page,
  hasNext,
  onChange,
}: {
  page: number;
  hasNext?: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Previous page
      </Button>
      <span className="text-sm tabular-nums">Page {page}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={() => onChange(page + 1)}
      >
        Next page
      </Button>
    </div>
  );
}

export function CsiMastersPage({ kind }: { kind: MasterKind }) {
  const { user, hasPermission } = useAuth();
  const activeBranch = useBranchStore((state) => state.activeBranch);
  const branchId =
    (hasPermission("branch:all") ? activeBranch?.id : undefined) ??
    user?.branchId;
  if (!branchId)
    return (
      <p className="p-4 text-sm">
        Select a workshop branch to view CSI masters.
      </p>
    );
  return (
    <MasterList
      key={kind + branchId}
      kind={kind}
      branchId={branchId}
      canEdit={hasPermission(CSI_PERMISSIONS.MASTER_UPDATE)}
    />
  );
}

function MasterList({
  kind,
  branchId,
  canEdit,
}: {
  kind: MasterKind;
  branchId: string;
  canEdit: boolean;
}) {
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Master | "new" | null>(null);
  const records = useCsiMasters(kind, branchId, page);
  const name = masterLabels[kind];
  const columns: Column<Master>[] = [
    { header: "Code", render: (row) => row.code },
    {
      header: "Description",
      render: (row) => {
        const description =
          "revisions" in row ? row.revisions[0]?.description : row.description;
        return (
          <span
            className="block max-w-48 truncate sm:max-w-md"
            title={description}
          >
            {description ?? "Not provided"}
          </span>
        );
      },
    },
    {
      header:
        kind === "cards"
          ? "Applies to"
          : kind === "attributes"
            ? "Weightage"
            : "Marks",
      className: kind === "cards" ? undefined : "text-right tabular-nums",
      headerClassName: kind === "cards" ? undefined : "text-right",
      render: (row) =>
        "weightage" in row
          ? row.weightage
          : "marks" in row
            ? row.marks
            : row.revisions[0]
              ? applicabilityLabels[row.revisions[0].appliesTo]
              : "Not provided",
    },
    {
      header: "Status",
      render: (row) => (
        <Badge tone={row.active ? "green" : "neutral"}>
          {row.active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];
  columns.push({
    header: "Actions",
    render: (row) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditor(row)}
        aria-label={(canEdit ? "Edit " : "View ") + row.code}
      >
        {canEdit ? (
          <>
            <Pencil />
            Edit
          </>
        ) : (
          <>
            <Eye />
            View
          </>
        )}
      </Button>
    ),
  });
  if (editor)
    return (
      <CsiMasterForm
        kind={kind}
        branchId={branchId}
        record={editor === "new" ? undefined : editor}
        readOnly={!canEdit}
        onClose={() => {
          setEditor(null);
          void records.refetch();
        }}
      />
    );

  return (
    <section className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={"CSI " + name + " master"}
        actions={
          canEdit && (
            <Button onClick={() => setEditor("new")}>
              <Plus />
              {"Add " + name}
            </Button>
          )
        }
      />
      {records.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {records.error &&
            "response" in records.error &&
            (records.error.response as { status?: number })?.status === 403
              ? "You do not have access to these CSI masters."
              : "CSI records could not be loaded."}
          </p>
          <Button variant="outline" onClick={() => records.refetch()}>
            Reload records
          </Button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={records.data?.items ?? []}
            rowKey={(row) => row.id}
            isLoading={records.isPending}
            emptyMessage={
              canEdit
                ? "No records yet. Add a " + name + " to get started."
                : "No records have been set up for this branch."
            }
          />
          {(page > 1 || records.data?.hasNext) && (
            <Pagination
              page={page}
              hasNext={records.data?.hasNext}
              onChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
