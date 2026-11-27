"use client";

import {
  Download,
  FileSpreadsheet,
  LayoutGrid,
  List,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { BRANCH_ALL } from "@/features/auth/roles";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";
import { formatTime } from "@/lib/format";
import { downloadCsv, downloadExcel } from "@/lib/table-actions";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useJobCards } from "../hooks/use-job-cards";
import { useJobBoard } from "../hooks/use-job-board";
import { useNow } from "../hooks/use-now";
import {
  BOARD_COLUMNS,
  boardSearch,
  columnListFilter,
  defaultView,
  readBoardFilters,
  type BoardFilters as Filters,
  type BoardView,
} from "../lib/board.logic";
import type { BoardColumnKey } from "../types/job-board.types";
import type { JobCard } from "../types/job-card.types";
import { JobCardsTable } from "./JobCardsTable";
import { BoardFilters } from "./board/BoardFilters";
import {
  BoardColumns,
  BoardDenied,
  BoardEmpty,
  BoardError,
  BoardFigures,
  BoardPhoneList,
  BoardSkeleton,
} from "./board/BoardParts";

function exportRows(jobCards: JobCard[]) {
  return jobCards.map((jobCard) => ({
    jobNumber: jobCard.jobNumber,
    vehicleRegistration: jobCard.vehicle?.registrationNumber ?? "",
    customer: jobCard.customer
      ? jobCard.customer.companyName ||
        `${jobCard.customer.firstName} ${jobCard.customer.lastName}`
      : "",
    branch: jobCard.branch?.name ?? "",
    agent: jobCard.createdBy
      ? `${jobCard.createdBy.firstName} ${jobCard.createdBy.lastName}`
      : "",
    status: jobCard.status,
    createdAt: jobCard.createdAt,
  }));
}

function exportColumns() {
  return [
    { key: "jobNumber", label: "Job #" },
    { key: "vehicleRegistration", label: "Vehicle Reg No" },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "agent", label: "Agent" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Created At" },
  ];
}

function ExportJobCardsButton({ branchId }: { branchId?: string }) {
  const { data } = useJobCards({ page: 1, limit: 1000, branchId });
  const jobCards = data?.jobCards ?? [];
  const filename = `dana-motors-job-cards-${new Date().toISOString().split("T")[0]}`;

  return (
    <ActionMenu
      align="end"
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={jobCards.length === 0}
          className="h-9 gap-1.5"
        >
          <Download className="size-4" />
          Export
        </Button>
      }
    >
      <ActionMenuItem
        icon={<Download className="size-4" />}
        onClick={() =>
          downloadCsv(filename, exportRows(jobCards), exportColumns())
        }
      >
        Export as CSV
      </ActionMenuItem>
      <ActionMenuItem
        icon={<FileSpreadsheet className="size-4" />}
        onClick={() =>
          downloadExcel(filename, exportRows(jobCards), exportColumns())
        }
      >
        Export as Excel
      </ActionMenuItem>
    </ActionMenu>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: BoardView;
  onChange: (view: BoardView) => void;
}) {
  const options: {
    value: BoardView;
    label: string;
    icon: typeof LayoutGrid;
  }[] = [
    { value: "board", label: "Board", icon: LayoutGrid },
    { value: "table", label: "Table", icon: List },
  ];
  return (
    <div
      role="group"
      aria-label="Show jobs as"
      className="inline-flex rounded-lg border border-border bg-card p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function BoardSection({
  filters,
  branchId,
  branchName,
  canCreate,
  onChange,
  onClear,
  tableHref,
}: {
  filters: Filters;
  branchId: string | undefined;
  branchName: string | null;
  canCreate: boolean;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
  tableHref: (key: BoardColumnKey) => string;
}) {
  const now = useNow(30_000);
  const query = useJobBoard(filters, branchId);
  const data = query.data;

  if (isAxiosError(query.error) && query.error.response?.status === 403)
    return <BoardDenied branchName={branchName} />;
  if (!data && (query.isPending || !branchId)) return <BoardSkeleton />;
  if (!data)
    return (
      <BoardError
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );

  const empty = data.columns.every((column) => column.total === 0);
  const filtered = !!(
    filters.advisorId ||
    filters.technicianId ||
    filters.date
  );
  const selected =
    filters.column ??
    data.columns.find((column) => column.total > 0)?.key ??
    "CHECK_IN";

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p role="status">
          Updated {formatTime(data.generatedAt)}. The board refreshes every
          minute.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={cn(
              "mr-2 size-4",
              query.isFetching && "animate-spin motion-reduce:animate-none",
            )}
            aria-hidden="true"
          />
          {query.isFetching ? "Refreshing" : "Refresh now"}
        </Button>
      </div>
      {query.isError && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          Could not refresh the board. It shows the jobs as at{" "}
          {formatTime(data.generatedAt)}.
          <button
            type="button"
            className="font-semibold underline underline-offset-4"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {empty ? (
        <BoardEmpty
          filtered={filtered}
          canCreate={canCreate}
          onClear={onClear}
        />
      ) : (
        <>
          <BoardFigures summary={data.summary} />
          <BoardColumns
            columns={data.columns}
            now={now}
            tableHref={tableHref}
          />
          <BoardPhoneList
            columns={data.columns}
            selected={selected}
            onSelect={(column) => onChange({ column })}
            now={now}
            tableHref={tableHref}
          />
        </>
      )}
    </div>
  );
}

/**
 * Job cards: the workshop board (every active job by step) or the table of all job cards. Managers open on the
 * board, everyone else on the table. Filters and the view live in the address bar.
 */
export function JobCardsPage() {
  const { user, hasPermission, isHydrated, isAdminOrAbove } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allBranches = useBranchStore((s) => s.branches);
  // Admins and cross-branch (branch:all) users may choose the branch, as on the server; others see their own.
  const canChooseBranch = isAdminOrAbove || hasPermission(BRANCH_ALL);
  const filtersBranch = searchParams.get("branch");
  // A branch in the address bar stays listed even when refused, so the Branch filter shows what was asked for.
  const branches = canChooseBranch
    ? allBranches
    : allBranches.filter((branch) => branch.id === user?.branchId || branch.id === filtersBranch);
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const filters = readBoardFilters(searchParams, defaultView(user?.role));
  const branchId = filters.branchId ?? activeBranch?.id;
  const branchName =
    allBranches.find((branch) => branch.id === branchId)?.name ??
    activeBranch?.name ??
    null;
  const { data } = useJobCards(
    { page: 1, limit: 1, branchId },
    filters.view === "table",
  );

  const hrefFor = (next: Partial<Filters>) =>
    `${pathname}?${boardSearch({ ...filters, ...next })}`;
  const update = (next: Partial<Filters>) =>
    router.replace(hrefFor(next), { scroll: false });
  const clear = () =>
    update({
      advisorId: undefined,
      technicianId: undefined,
      date: undefined,
      column: undefined,
    });
  const tableHref = (column: BoardColumnKey) =>
    hrefFor({ view: "table", column });
  const board = filters.view === "board";

  if (isHydrated && !hasPermission("jobcard:read"))
    return (
      <div className="p-4 lg:p-6">
        <BoardDenied branchName={null} />
      </div>
    );

  const tableFilters = {
    branchId,
    advisorId: filters.advisorId,
    technicianId: filters.technicianId,
    dateFrom: filters.date,
    dateTo: filters.date,
    ...(filters.column ? columnListFilter(filters.column) : {}),
  };

  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title={board ? "Workshop board" : "Job Cards"}
        description={
          board
            ? "Every active job in the workshop, by step, with who has it and how long it has been there."
            : data?.meta?.total != null
              ? `${data.meta.total} ${data.meta.total === 1 ? "job card" : "job cards"} on record`
              : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle
              view={filters.view}
              onChange={(view) =>
                update({
                  view,
                  column: view === "board" ? undefined : filters.column,
                })
              }
            />
            {!board && hasPermission("jobcard:multi-vehicle:read") && (
              <Button asChild variant="outline" size="sm">
                <Link href="/job-cards/multi-job-vehicles">
                  Vehicles with multiple jobs
                </Link>
              </Button>
            )}
            {!board && <ExportJobCardsButton branchId={branchId} />}
          </div>
        }
      />
      <BoardFilters
        filters={filters}
        branchId={branchId}
        branches={branches}
        now={new Date()}
        onChange={update}
        onClear={clear}
      />
      {!isHydrated ? (
        <BoardSkeleton />
      ) : board ? (
        <BoardSection
          filters={filters}
          branchId={branchId}
          branchName={branchName}
          canCreate={hasPermission("jobcard:create")}
          onChange={update}
          onClear={clear}
          tableHref={tableHref}
        />
      ) : (
        <>
          {filters.column && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                Showing jobs at{" "}
                <span className="font-semibold">
                  {BOARD_COLUMNS[filters.column].label}
                </span>{" "}
                only.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => update({ column: undefined })}
              >
                <X className="mr-1.5 size-4" aria-hidden="true" />
                Show every step
              </Button>
            </p>
          )}
          <JobCardsTable filters={tableFilters} />
        </>
      )}
    </div>
  );
}
