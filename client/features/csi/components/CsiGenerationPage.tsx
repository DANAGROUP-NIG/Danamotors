"use client";

import { useState } from "react";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DataTable,
  type Column,
} from "@/components/ui/table-components/DataTable";
import { DataTableEmptyState } from '@/components/ui/table-components/DataTableEmptyState';
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranchStore } from "@/store/branch.store";
import { fmtDate } from "@/features/reports/lib/report-format";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import {
  useCsiCandidates,
  useGenerateCsiCards,
  type CsiCandidate,
  type GenerationFilters,
  type CsiQuestionnaire,
} from "../hooks/use-csi-issuance";
import { CsiGenerationFilters } from "./CsiGenerationFilters";
import { CsiQuestionnairePrint } from "./CsiQuestionnairePrint";

const statuses = {
  issued: { label: "Issued", tone: "blue" },
  eligible: { label: "Ready to issue", tone: "green" },
  blocked: { label: "Action required", tone: "amber" },
} as const;
export function CsiGenerationPage() {
  const { user, hasPermission } = useAuth();
  const active = useBranchStore((state) => state.activeBranch);
  if (!hasPermission("csi:card:generate"))
    return (
      <p role="alert" className="p-4 text-sm">
        You do not have permission to generate or print CSI cards. Ask your
        service manager for access.
      </p>
    );
  const branchId =
    (hasPermission("branch:all") ? active?.id : undefined) ?? user?.branchId;
  if (!branchId)
    return (
      <p className="p-4 text-sm">
        Select a workshop branch before generating CSI cards.
      </p>
    );
  return (
    <GenerationSession
      key={branchId}
      branchId={branchId}
      canReadMasters={hasPermission("csi:master:read")}
    />
  );
}
function GenerationSession({
  branchId,
  canReadMasters,
}: {
  branchId: string;
  canReadMasters: boolean;
}) {
  const [filters, setFilters] = useState<GenerationFilters | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [surveys, setSurveys] = useState<CsiQuestionnaire[]>([]);
  const records = useCsiCandidates(branchId, filters, page);
  const generate = useGenerateCsiCards(branchId);
  const toggle = (id: string) =>
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const items = records.data?.items ?? [];
  const available = items.filter((row) => row.canGenerate || row.surveyId);
  const allSelected =
    available.length > 0 &&
    available.every((row) => selected.has(row.jobCardId));
  const columns: Column<CsiCandidate>[] = [
    {
      header: (
        <Checkbox
          aria-label="Select all eligible jobs on this page"
          disabled={!available.length || generate.isPending}
          checked={allSelected}
          onCheckedChange={(checked) =>
            setSelected(
              new Set(checked ? available.map((row) => row.jobCardId) : []),
            )
          }
        />
      ),
      render: (row) => (
        <Checkbox
          aria-label={`Select job ${row.jobNumber}`}
          disabled={generate.isPending || (!row.canGenerate && !row.surveyId)}
          checked={selected.has(row.jobCardId)}
          onCheckedChange={() => toggle(row.jobCardId)}
        />
      ),
    },
    { header: "Job number", render: (row) => row.jobNumber },
    { header: "Job date", render: (row) => fmtDate(row.jobDate) },
    {
      header: "Registration",
      render: (row) => row.registration || "Not provided",
    },
    {
      header: "Model / variant",
      render: (row) => (
        <span
          className="block max-w-48 truncate"
          title={[row.model, row.variant].filter(Boolean).join(", ")}
        >
          {[row.model, row.variant].filter(Boolean).join(", ") ||
            "Not provided"}
        </span>
      ),
    },
    {
      header: "CSI card",
      render: (row) => (
        <span title={row.cardDescription || undefined}>
          {row.card || "Not available"}
        </span>
      ),
    },
    {
      header: "Status",
      render: (row) => {
        const status =
          statuses[
            row.surveyId ? "issued" : row.canGenerate ? "eligible" : "blocked"
          ];
        return (
          <div className="space-y-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            {row.reason && (
              <p className="max-w-64 text-xs text-muted-foreground">
                {row.reason}
              </p>
            )}
          </div>
        );
      },
    },
  ];
  const issue = () => {
    const ids = items
      .filter((row) => selected.has(row.jobCardId))
      .map((row) => row.jobCardId);
    generate.mutate(ids, {
      onSuccess: (result) => {
        setSurveys(result.surveys);
        setSelected(new Set());
        toast.success(
          `${result.created} CSI cards issued, ${result.reused} existing cards loaded.`,
        );
      },
      onError: (error) =>
        toast.error(
          apiErrorMessage(
            error,
            "CSI cards could not be prepared. Check the selected jobs and retry.",
          ),
        ),
    });
  };
  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="space-y-5 print:hidden">
        <PageHeader
          title="CSI card generation"
          description="Issue customer questionnaires for delivered jobs, or reprint the original cards."
        />
        <CsiGenerationFilters
          branchId={branchId}
          busy={records.isFetching || generate.isPending}
          onApply={(values) => {
            setFilters({ ...values });
            setPage(1);
            setSelected(new Set());
            setSurveys([]);
          }}
        />
        {records.isError && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-border p-4 text-sm"
          >
            <p>
              {apiErrorMessage(
                records.error,
                "Delivered jobs could not be loaded. Check the filters and retry.",
              )}
            </p>
            <Button variant="outline" onClick={() => void records.refetch()}>
              Retry delivered jobs
            </Button>
          </div>
        )}
        {filters === null ? (
          <p className="text-sm text-muted-foreground">
            Set the filters and select Load delivered jobs to prepare CSI cards.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-sm text-muted-foreground">
                {selected.size} jobs selected. Generate up to 25 cards at a
                time.
              </p>
              <Button
                disabled={
                  !selected.size ||
                  generate.isPending ||
                  records.isFetching ||
                  records.isError
                }
                onClick={issue}
              >
                <FilePlus2 className="size-4" />
                {generate.isPending
                  ? "Preparing CSI cards"
                  : "Prepare selected cards"}
              </Button>
            </div>
            {!records.isError && !records.isPending && !items.length ? (
              <div className="rounded-xl border border-border bg-background">
                <table className="w-full" aria-label="CSI generation results"><tbody><DataTableEmptyState colSpan={1} message="No delivered jobs match these filters. Widen the job dates or select All for more filters." /></tbody></table>
                <div className="pb-4 text-center"><Button variant="outline" onClick={() => setFilters(null)}>Review job filters</Button></div>
              </div>
            ) : !records.isError && <DataTable
              columns={columns}
              data={records.isError ? [] : items}
              rowKey={(row) => row.jobCardId}
              isLoading={records.isPending}
              isFetching={records.isFetching}
              emptyMessage="No delivered jobs match these filters. Widen the job dates or select All for more filters."
              page={page}
              pageSize={25}
              total={records.data?.total ?? 0}
              totalPages={records.data?.totalPages ?? 1}
              onPageChange={(value) => {
                setPage(value);
                setSelected(new Set());
              }}
            />}
          </>
        )}
        {canReadMasters && (
          <p className="text-sm text-muted-foreground">
            Missing a matching questionnaire?{" "}
            <Link href="/csi/cards" className="text-primary underline">
              Review CSI card masters
            </Link>
            .
          </p>
        )}
      </div>
      {!!surveys.length && (
        <CsiQuestionnairePrint
          surveys={surveys}
          onClose={() => setSurveys([])}
        />
      )}
    </div>
  );
}
