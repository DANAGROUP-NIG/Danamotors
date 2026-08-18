"use client";

// import { useState } from "react";
// import { Plus } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import { PageHeader } from "@/components/headers/page-header";
// import ModalFame from "@/components/modals/ModalFame";
// import { useBranchStore } from "@/store/branch.store";
// import { useAuth } from "@/features/auth/hooks/use-auth";
// import { useAppointments } from "../hooks/use-appointments";
// import { AppointmentCreateForm } from "./AppointmentCreateForm";
// import { AppointmentsTable } from "./AppointmentsTable";

// export function AppointmentsPage() {
//   const [showForm, setShowForm] = useState(false);
//   const activeBranch = useBranchStore((s) => s.activeBranch);
//   const { isSuperAdmin } = useAuth();
//   const branchId = isSuperAdmin
//     ? (activeBranch?.id ?? undefined)
//     : (activeBranch?.id ?? undefined);
//   const { data } = useAppointments({ page: 1, limit: 1, branchId });

//   return (
//     <div className="flex flex-col gap-5 p-4 lg:p-6">
//       <PageHeader
//         title="Appointments"
//         description={
//           data?.meta?.total != null
//             ? `${data.meta.total} ${data.meta.total === 1 ? "appointment" : "appointments"} on record`
//             : undefined
//         }
//         actions={
//           <Button onClick={() => setShowForm(true)} size="sm">
//             <Plus className="size-4" />
//             Book appointment
//           </Button>
//         }
//       />

//       <ModalFame
//         isOpen={showForm}
//         onClose={() => setShowForm(false)}
//         title="Book appointment"
//       >
//         <AppointmentCreateForm onSuccess={() => setShowForm(false)} />
//       </ModalFame>
//       <AppointmentsTable />
//     </div>
//   );
// }



import { useState } from 'react';
import { Calendar, Inbox, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ModalFame from '@/components/modals/ModalFame';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { APPOINTMENT_CREATE_ROLES, ENQUIRY_READ_ROLES } from '@/features/auth/roles';
import { AppointmentsTable } from './AppointmentsTable';
import { AppointmentCreateForm } from './AppointmentCreateForm';
import { EnquiriesTable } from '@/features/enquiry/components/EnquiriesTable';

const TABS = ['appointments', 'enquiries'] as const;
type Tab = (typeof TABS)[number];



export function AppointmentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('appointments');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { hasAccess } = useAuth();
  const canCreate    = hasAccess(APPOINTMENT_CREATE_ROLES);
  const canSeeTriageQueue = hasAccess(ENQUIRY_READ_ROLES);

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Appointments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage walk-in bookings and online service enquiries.
          </p>
        </div>

        {canCreate && (
          <Button
            id="appointment-create-btn"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="size-4" />
            New Walk-in
          </Button>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      {canSeeTriageQueue && (
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
          <button
            id="tab-appointments"
            onClick={() => setActiveTab('appointments')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === 'appointments'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="size-4" />
            All Appointments
          </button>
          <button
            id="tab-enquiries"
            onClick={() => setActiveTab('enquiries')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === 'enquiries'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Inbox className="size-4" />
            Triage Queue
          </button>
        </div>
      )}

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      {activeTab === 'appointments' || !canSeeTriageQueue
        ? <AppointmentsTable />
        : <EnquiriesTable />}

      {/* ── Walk-in Creation Modal ───────────────────────────────────────── */}
      <ModalFame
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Book Walk-in Appointment"
      >
        <AppointmentCreateForm onSuccess={() => setIsCreateModalOpen(false)} />
      </ModalFame>
    </div>
  );
}
