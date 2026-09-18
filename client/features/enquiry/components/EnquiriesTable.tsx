'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye,
  Download,
  Share2,
  Mail,
  MessageCircle,
  Link2,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/table-components/DataTable';
import { DataTableToolbar } from '@/components/ui/table-components/DataTableToolbar';
import { DataTableFilterChips } from '@/components/ui/table-components/DataTableFilterChips';
import { DataTableBulkToolbar } from '@/components/ui/table-components/DataTableBulkToolbar';
import { DataTableRowActions } from '@/components/ui/table-components/DataTableRowActions';
import { useDataTableSelection } from '@/hooks/use-data-table-selection';
import {
  downloadCsv,
  downloadExcel,
  shareItems,
  openMailto,
  openWhatsApp,
  copyToClipboard,
} from '@/lib/table-actions';
import { DateInput } from '@/components/forms/DateInput';
import { useBranchStore } from '@/store/branch.store';
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

type ExportableEnquiryRow = Record<string, string | number | boolean | null | undefined>;

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function vehicleLabel(e: Enquiry): string {
  const parts = [e.vehicleMake, e.vehicleModel, e.vehicleRegNumber].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '';
}

function exportColumns() {
  return [
    { key: 'id', label: 'ID' },
    { key: 'customer', label: 'Customer' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'vehicle', label: 'Vehicle' },
    { key: 'preferredDate', label: 'Preferred Date' },
    { key: 'status', label: 'Status' },
    { key: 'branch', label: 'Branch' },
    { key: 'serviceDescription', label: 'Service Description' },
    { key: 'submittedAt', label: 'Submitted' },
  ];
}

function toExportableRow(e: Enquiry): ExportableEnquiryRow {
  return {
    id: e.id,
    customer: `${e.firstName} ${e.lastName}`.trim(),
    email: e.email,
    phone: e.phoneNumber,
    vehicle: vehicleLabel(e),
    preferredDate: formatDate(e.preferredDate),
    status: e.status,
    branch: e.branch.name,
    serviceDescription: e.serviceDescription,
    submittedAt: formatDate(e.createdAt),
  };
}

function formatEnquiryText(e: Enquiry): string {
  const name = `${e.firstName} ${e.lastName}`.trim();
  const vehicle = vehicleLabel(e) || 'N/A';
  return [
    `*${name}*`,
    `Email: ${e.email}`,
    `Phone: ${e.phoneNumber}`,
    `Vehicle: ${vehicle}`,
    `Preferred date: ${formatDate(e.preferredDate) || 'N/A'}`,
    `Status: ${e.status}`,
    `Branch: ${e.branch.name}`,
    `Service: ${e.serviceDescription}`,
  ].join('\n');
}

export function EnquiriesTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Pending');  // default to Pending
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const router = useRouter();

  const activeBranch = useBranchStore((s) => s.activeBranch);
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

  const enquiries = useMemo(() => data?.enquiries ?? [], [data?.enquiries]);
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selection = useDataTableSelection<Enquiry>({
    data: enquiries,
    rowKey: (e) => e.id,
  });

  function commitSearch() { setDebouncedSearch(search); setPage(1); }
  function clearSearch()  { setSearch(''); setDebouncedSearch(''); setPage(1); }

  function exportSelected(items: Enquiry[]) {
    const rows = items.map(toExportableRow);
    const filename = `enquiries-${new Date().toISOString().split('T')[0]}`;
    downloadCsv(filename, rows, exportColumns());
  }

  function exportSelectedExcel(items: Enquiry[]) {
    const rows = items.map(toExportableRow);
    const filename = `enquiries-${new Date().toISOString().split('T')[0]}`;
    downloadExcel(filename, rows, exportColumns());
  }

  function shareSelected(items: Enquiry[]) {
    const text = items.map(formatEnquiryText).join('\n\n---\n\n');
    shareItems({ title: `${items.length} Dana Motors Enquiries`, text });
  }

  function emailSelected(items: Enquiry[]) {
    const body = items.map(formatEnquiryText).join('\n\n---\n\n');
    openMailto({
      subject: `${items.length} Enquir${items.length === 1 ? 'y' : 'ies'} from Dana Motors`,
      body,
    });
  }

  function whatsappSelected(items: Enquiry[]) {
    const message = items.map(formatEnquiryText).join('\n\n---\n\n');
    openWhatsApp({ message });
  }

  const columns: Column<Enquiry>[] = [
    {
      header: 'Customer',
      render: (e) => (
        <div>
          <p className='font-medium text-foreground'>
            {e.firstName} {e.lastName}
          </p>
          <p className='text-xs text-muted-foreground'>{e.email}</p>
        </div>
      ),
    },
    {
      header: 'Phone',
      render: (e) => <span className='text-muted-foreground'>{e.phoneNumber}</span>,
    },
    {
      header: 'Vehicle',
      render: (e) => {
        const label = vehicleLabel(e);
        return (
          <span className='text-muted-foreground'>
            {label || '—'}
          </span>
        );
      },
    },
    {
      header: 'Branch',
      render: (e) => <span className='text-muted-foreground'>{e.branch.name}</span>,
    },
    {
      header: 'Preferred Date',
      render: (e) => (
        <span className='text-muted-foreground'>
          {formatDate(e.preferredDate) || '—'}
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
        <span className='text-xs text-muted-foreground'>
          {formatDate(e.createdAt)}
        </span>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (e) => (
        <DataTableRowActions
          item={e}
          actions={[
            {
              id: 'view',
              label: 'View details',
              icon: <Eye className='size-4' />,
              onClick: () => router.push(`/enquiries/${e.id}`),
            },
            {
              id: 'download',
              label: 'Download CSV',
              icon: <Download className='size-4' />,
              onClick: () => exportSelected([e]),
            },
            {
              id: 'share',
              label: 'Share',
              icon: <Share2 className='size-4' />,
              onClick: () =>
                shareItems({ title: 'Enquiry', text: formatEnquiryText(e) }),
            },
            {
              id: 'email',
              label: 'Email',
              icon: <Mail className='size-4' />,
              onClick: () =>
                openMailto({
                  subject: `Enquiry from ${e.firstName} ${e.lastName}`,
                  body: formatEnquiryText(e),
                }),
            },
            {
              id: 'whatsapp',
              label: 'WhatsApp',
              icon: <MessageCircle className='size-4' />,
              onClick: () => openWhatsApp({ message: formatEnquiryText(e) }),
            },
            {
              id: 'copy-link',
              label: 'Copy link',
              icon: <Link2 className='size-4' />,
              shortcut: '⌘C',
              onClick: () =>
                copyToClipboard(
                  `${window.location.origin}/enquiries/${e.id}`,
                  'Enquiry link copied',
                ),
            },
          ]}
        />
      ),
    },
  ];

  if (isError) {
    return (
      <div className='rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center'>
        <p className='text-sm text-red-600'>
          Failed to load enquiries. Please check the API connection and try again.
        </p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={enquiries}
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
      selection={selection}
    >
      <div className='flex flex-col gap-4'>
        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          onSearch={commitSearch}
          onClearSearch={clearSearch}
          placeholder='Search by name, email, or vehicle…'
          isLoading={isLoading}
          isFetching={isFetching}
          filters={
            <>
              <div className='flex items-center gap-2'>
                <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
                <span className='text-xs text-muted-foreground'>to</span>
                <DateInput value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} />
              </div>
              <DataTableFilterChips options={STATUS_OPTIONS} selected={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} />
            </>
          }
        />

        <DataTableBulkToolbar
          selectedCount={selection.selectedIds.size}
          totalCount={total}
          selectedItems={selection.selectedItems}
          onClear={selection.clear}
          actions={[
            {
              id: 'export',
              label: 'CSV',
              icon: <Download className='size-3.5' />,
              variant: 'ghost',
              onClick: exportSelected,
            },
            {
              id: 'excel',
              label: 'Excel',
              icon: <FileSpreadsheet className='size-3.5' />,
              variant: 'ghost',
              onClick: exportSelectedExcel,
            },
            {
              id: 'share',
              label: 'Share',
              icon: <Share2 className='size-3.5' />,
              variant: 'ghost',
              onClick: shareSelected,
            },
            {
              id: 'email',
              label: 'Email',
              icon: <Mail className='size-3.5' />,
              variant: 'ghost',
              onClick: emailSelected,
            },
            {
              id: 'whatsapp',
              label: 'WhatsApp',
              icon: <MessageCircle className='size-3.5' />,
              variant: 'ghost',
              onClick: whatsappSelected,
            },
          ]}
        />
      </div>
    </DataTable>
  );
}
