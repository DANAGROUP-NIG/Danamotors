"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/table-components/DataTable';
import { DataTableToolbar } from '@/components/ui/table-components/DataTableToolbar';
import { DataTableFilterChips } from '@/components/ui/table-components/DataTableFilterChips';
import { DateInput } from '@/components/forms/DateInput';
// Modal removed: navigate to a dedicated enquiry page instead
import { useBranchStore } from '@/store/branch.store';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ENQUIRY_REVIEW_ROLES } from '@/features/auth/roles';
import { useEnquiries } from '../hooks/use-enquires';
import type { Enquiry, EnquiryStatus } from '../types/enquiry.types';

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<EnquiryStatus, string> = {
  Pending:   'Pending',
  Approved:  'Approved',
  Rejected:  'Rejected',
  Converted: 'Converted',
};

const STATUS_COLORS: Record<EnquiryStatus, string> = {
  Pending:   'bg-amber-50 text-amber-700',
  Approved:  'bg-emerald-50 text-emerald-700',
  Rejected:  'bg-red-50 text-red-600',
  Converted: 'bg-blue-50 text-blue-700',
};

const STATUS_OPTIONS = [
  { label: 'All',       value: '' },
  { label: 'Pending',   value: 'Pending' },
  { label: 'Approved',  value: 'Approved' },
  { label: 'Rejected',  value: 'Rejected' },
  { label: 'Converted', value: 'Converted' },
];

export function EnquiriesTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Pending');  // default to Pending
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const router = useRouter();

  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { hasAccess } = useAuth();
  const canReview = hasAccess(ENQUIRY_REVIEW_ROLES);
  const branchId = activeBranch?.id ?? undefined;

  const { data, isLoading, isError, isFetching } = useEnquiries({
    page,
    limit: PAGE_SIZE,
    branchId,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // no local review modal — navigating to detail page

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch()  { setSearch(''); setDebouncedSearch(''); setPage(1); }

  const columns: Column<Enquiry>[] = [
    {
      header: 'Customer',
      render: (e) => (
        <div>
          <p className="font-medium text-foreground">
            {e.firstName} {e.lastName}
          </p>
          <p className="text-xs text-muted-foreground">{e.email}</p>
        </div>
      ),
    },
    {
      header: 'Phone',
      render: (e) => <span className="text-muted-foreground">{e.phoneNumber}</span>,
    },
    {
      header: 'Vehicle',
      render: (e) => {
        const parts = [e.vehicleMake, e.vehicleModel, e.vehicleRegNumber].filter(Boolean);
        return (
          <span className="text-muted-foreground">
            {parts.length > 0 ? parts.join(' · ') : '—'}
          </span>
        );
      },
    },
    {
      header: 'Branch',
      render: (e) => <span className="text-muted-foreground">{e.branch.name}</span>,
    },
    {
      header: 'Preferred Date',
      render: (e) => (
        <span className="text-muted-foreground">
          {e.preferredDate
            ? new Date(e.preferredDate).toLocaleDateString(undefined, { dateStyle: 'medium' })
            : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      render: (e) => (
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            STATUS_COLORS[e.status],
          )}
        >
          {STATUS_LABELS[e.status]}
        </span>
      ),
    },
    {
      header: 'Submitted',
      render: (e) => (
        <span className="text-xs text-muted-foreground">
          {new Date(e.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </span>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      render: (e) => (
        <div className="flex items-center justify-end" onClick={(ev) => ev.stopPropagation()}>
          <Button
            id={`enquiry-view-${e.id}`}
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/enquiries/${e.id}`)}
          >
            <Eye className="size-3.5" />
            {canReview && e.status === 'Pending' ? 'Review' : 'View'}
          </Button>
        </div>
      ),
    },
  ];

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
        <p className="text-sm text-red-600">
          Failed to load enquiries. Please check the API connection and try again.
        </p>
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={data?.enquiries ?? []}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={
          statusFilter === 'Pending'
            ? 'No pending enquiries. All caught up! 🎉'
            : `No ${statusFilter.toLowerCase()} enquiries found.`
        }
        rowKey={(e) => e.id}
        onRowClick={(e) => router.push(`/enquiries/${e.id}`)}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder="Search by name, email, or vehicle…"
          filters={
            <>
              <div className="flex items-center gap-2">
                <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
                <span className="text-xs text-muted-foreground">to</span>
                <DateInput value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} />
              </div>
              <DataTableFilterChips options={STATUS_OPTIONS} selected={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} />
            </>
          }
        />
      </DataTable>

      {/* Navigation to the enquiry detail page replaces the modal */}
    </>
  );
}