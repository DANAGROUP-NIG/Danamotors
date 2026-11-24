"use client";
import { useState, type FormEvent } from "react";
import Link from 'next/link';
import { DataTableEmptyState } from '@/components/ui/table-components/DataTableEmptyState';
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, inputCls } from "@/components/forms/FormField";
import {
  DataTable,
  type Column,
} from "@/components/ui/table-components/DataTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { fmtDate, fmtNumber } from "@/features/reports/lib/report-format";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import {
  csiSurveyStatus,
  useCsiResponseList,
} from "../hooks/use-csi-responses";
import { CsiResponseForm } from "./CsiResponseForm";

export function CsiResponsesPage() {
  const { user, hasPermission } = useAuth();
  const branch = useBranchStore((state) => state.activeBranch);
  if (!hasPermission("csi:response:read"))
    return (
      <p role="alert" className="p-4 text-sm">
        You do not have permission to view CSI responses. Ask the service
        manager for access.
      </p>
    );
  const branchId =
    (hasPermission("branch:all") ? branch?.id : undefined) ?? user?.branchId;
  if (!branchId)
    return (
      <p className="p-4 text-sm">
        Select a workshop branch to view issued questionnaires.
      </p>
    );
  return (
    <ResponseList
      key={branchId}
      branchId={branchId}
      canEdit={hasPermission("csi:response:update")}
      canGenerate={hasPermission('csi:card:generate')}
    />
  );
}
function ResponseList({
  branchId,
  canEdit,
  canGenerate,
}: {
  branchId: string;
  canEdit: boolean;
  canGenerate: boolean;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const query = useCsiResponseList(branchId, search, page);
  type Row = NonNullable<typeof query.data>["items"][number];
  const columns: Column<Row>[] = [
    { header: "Job number", render: (row) => row.jobSnapshot.jobNumber },
    {
      header: "Customer",
      render: (row) => (
        <span
          className="block max-w-48 truncate"
          title={row.jobSnapshot.customer}
        >
          {row.jobSnapshot.customer || "Not provided"}
        </span>
      ),
    },
    {
      header: "Registration",
      render: (row) => row.jobSnapshot.registration || "Not provided",
    },
    {
      header: "Status",
      render: (row) => {
        const status = csiSurveyStatus[row.status];
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
    {
      header: "Response date",
      render: (row) =>
        row.responseDate ? fmtDate(row.responseDate) : "Not recorded",
    },
    {
      header: "Score %",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) =>
        row.scorePercent === null
          ? "Not recorded"
          : `${fmtNumber(Number(row.scorePercent), "number")}%`,
    },
    {
      header: "Response",
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => setOpen(row.id)}>
          {canEdit ? "Open response" : "View response"}
        </Button>
      ),
    },
  ];
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(draft.trim());
    setPage(1);
  };
  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title="CSI card responses"
        description="Find an issued questionnaire by job number, record the customer responses, or audit a correction."
      />
      <form className="flex flex-wrap items-end gap-3" onSubmit={apply}>
        <Field label="Job number">
          <input
            className={inputCls}
            value={draft}
            maxLength={40}
            onChange={(event) => setDraft(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={query.isFetching}>
          Find questionnaires
        </Button>
      </form>
      {query.isError && (
        <div role="alert" className="space-y-2 text-sm">
          <p>
            {apiErrorMessage(
              query.error,
              "Issued questionnaires could not be loaded. Check the selected branch and retry.",
            )}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry questionnaires
          </Button>
        </div>
      )}
      {!query.isError && !query.isPending && !query.data?.items.length ? (
        <div className="rounded-xl border border-border bg-background">
          <table className="w-full" aria-label="Issued CSI questionnaires"><tbody><DataTableEmptyState colSpan={1} message="No issued questionnaires match this job number. Generate the delivered job's CSI card first, or clear the search." /></tbody></table>
          <div className="flex flex-wrap justify-center gap-2 pb-4">
            {search && <Button variant="outline" onClick={() => { setDraft(''); setSearch(''); setPage(1); }}>Clear job search</Button>}
            {canGenerate && <Button variant="outline" asChild><Link href="/csi/generate">Generate CSI cards</Link></Button>}
          </div>
        </div>
      ) : !query.isError && <DataTable
        columns={columns}
        data={query.isError ? [] : (query.data?.items ?? [])}
        isLoading={query.isPending}
        rowKey={(row) => row.id}
        emptyMessage="No issued questionnaires match this job number. Generate the delivered job's CSI card first, or clear the search."
      />}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous page
        </Button>
        <span className="text-sm">Page {page}</span>
        <Button
          variant="outline"
          disabled={!query.data?.hasNext || query.isFetching}
          onClick={() => setPage((value) => value + 1)}
        >
          Next page
        </Button>
      </div>
      {open && (
        <CsiResponseForm
          branchId={branchId}
          id={open}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
