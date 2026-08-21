'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { DateTimeInput } from '@/components/forms/DateTimeInput';
import { CustomerSelectWithCreate } from '@/features/customers/components/CustomerSelectWithCreate';
import { VehicleSelectWithCreate } from '@/features/vehicles/components/VehicleSelectWithCreate';
import { useServices } from '@/features/services/hooks/use-services';
import { useBranchStore } from '@/store/branch.store';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ENQUIRY_REVIEW_ROLES } from '@/features/auth/roles';
import { useReviewEnquiry } from '../hooks/use-review-enquiry';
import type { Enquiry } from '../types/enquiry.types';

// ─── Approval form schema ─────────────────────────────────────────────────────
const approveSchema = z.object({
  customerId:   z.string().uuid('Please select or create a customer'),
  vehicleId:    z.string().uuid('Please select or create a vehicle'),
  scheduledAt:  z.string().min(1, 'Please set an appointment date and time'),
  serviceId:    z.string().uuid().optional().or(z.literal('')),
  durationMins: z.coerce.number().int().positive().optional().or(z.literal('')),
  reviewNotes:  z.string().max(500).optional(),
});

type ApproveFormValues = z.infer<typeof approveSchema>;

interface EnquiryReviewModalProps {
  enquiry:  Enquiry;
  onClose:  () => void;
}

// ─── Confirmation dialog for reject action ────────────────────────────────────
function RejectConfirmDialog({
  onConfirm, onCancel, isPending,
}: { onConfirm: (notes?: string) => void; onCancel: () => void; isPending: boolean }) {
  const [notes, setNotes] = useState('');
  return (
    <div className="space-y-4 rounded-xl border border-destructive/20 bg-destructive/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-semibold text-foreground">Reject this enquiry?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This will mark the enquiry as Rejected. This action cannot be undone.
          </p>
        </div>
      </div>
      <textarea
        className="min-h-16 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-ring"
        placeholder="Reason for rejection (optional)…"
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onConfirm(notes || undefined)}
          disabled={isPending}
        >
          {isPending ? 'Rejecting…' : 'Confirm Rejection'}
        </Button>
      </div>
    </div>
  );
}

// ─── Approve confirm step ─────────────────────────────────────────────────────
function ApproveConfirmDialog({
  customerName, scheduledAt, onConfirm, onBack, isPending,
}: {
  customerName: string; scheduledAt: string;
  onConfirm: () => void; onBack: () => void; isPending: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold text-foreground">Confirm Appointment?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This will create a new appointment for <strong>{customerName}</strong> scheduled
            for <strong>{new Date(scheduledAt).toLocaleString()}</strong>.
          </p>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onBack} disabled={isPending}>
          Back to Edit
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isPending ? 'Approving…' : 'Confirm & Approve'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main modal component ─────────────────────────────────────────────────────
export function EnquiryReviewModal({ enquiry, onClose }: EnquiryReviewModalProps) {
  const [step, setStep] = useState<'details' | 'approve-form' | 'approve-confirm' | 'reject-confirm'>('details');
  const [approveFormValues, setApproveFormValues] = useState<ApproveFormValues | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');

  const reviewEnquiry = useReviewEnquiry();
  const { hasAccess, isSuperAdmin } = useAuth();
  const canReview = hasAccess(ENQUIRY_REVIEW_ROLES) && enquiry.status === 'open';
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const { data: services } = useServices({ limit: 100 });

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm<ApproveFormValues>({
    resolver: zodResolver(approveSchema),
    defaultValues: {
      customerId: '', vehicleId: '', scheduledAt: '', serviceId: '', reviewNotes: '',
    },
  });

  const selectedCustomerId = watch('customerId');
  const selectedScheduledAt = watch('scheduledAt');

  function onApproveSubmit(values: ApproveFormValues) {
    setApproveFormValues(values);
    setStep('approve-confirm');
  }

  function confirmApprove() {
    if (!approveFormValues) return;
    reviewEnquiry.mutate(
      {
        id: enquiry.id,
        payload: {
          action:       'approve',
          customerId:   approveFormValues.customerId,
          vehicleId:    approveFormValues.vehicleId,
          scheduledAt:  new Date(approveFormValues.scheduledAt).toISOString(),
          serviceId:    approveFormValues.serviceId || undefined,
          durationMins: approveFormValues.durationMins
                          ? Number(approveFormValues.durationMins)
                          : undefined,
          reviewNotes:  approveFormValues.reviewNotes || undefined,
        },
      },
      { onSuccess: () => onClose() },
    );
  }

  function confirmReject(notes?: string) {
    reviewEnquiry.mutate(
      { id: enquiry.id, payload: { action: 'reject', reviewNotes: notes } },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
      {/* ── Enquiry Details Summary ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Name',   `${enquiry.firstName} ${enquiry.lastName}`],
            ['Email',  enquiry.email],
            ['Phone',  enquiry.phoneNumber],
            ['Branch', enquiry.branch.name],
            ['Vehicle', [enquiry.vehicleMake, enquiry.vehicleModel, enquiry.vehicleRegNumber].filter(Boolean).join(' · ') || '—'],
            ['Preferred Date', enquiry.preferredDate
              ? new Date(enquiry.preferredDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
              : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="mt-0.5 font-medium text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service Description</p>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{enquiry.serviceDescription}</p>
        </div>

        {enquiry.status !== 'open' && (
          <div className="rounded-lg bg-background border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Reviewed by {enquiry.reviewedBy
                ? `${enquiry.reviewedBy.firstName} ${enquiry.reviewedBy.lastName}`
                : 'staff'}{' '}
              on {enquiry.reviewedAt
                ? new Date(enquiry.reviewedAt).toLocaleDateString()
                : '—'}
            </p>
            {enquiry.reviewNotes && (
              <p className="mt-1 text-sm text-foreground">{enquiry.reviewNotes}</p>
            )}
            {enquiry.appointment && (
              <a
                href={`/appointments/${enquiry.appointment.id}`}
                className="mt-2 inline-flex items-center text-xs font-medium text-blue-600 hover:underline"
              >
                View Appointment →
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Action area ─────────────────────────────────────────────────── */}
      {canReview && (
        <>
          {step === 'details' && (
            <div className="flex gap-3">
              <Button
                id="enquiry-action-approve"
                size="sm"
                onClick={() => setStep('approve-form')}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle className="mr-2 size-4" />
                Approve & Schedule
              </Button>
              <Button
                id="enquiry-action-reject"
                size="sm"
                variant="outline"
                onClick={() => setStep('reject-confirm')}
                className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/5"
              >
                <XCircle className="mr-2 size-4" />
                Reject
              </Button>
            </div>
          )}

          {step === 'approve-form' && (
            <form className="space-y-4" onSubmit={handleSubmit(onApproveSubmit)} noValidate>
              <p className="text-sm font-semibold text-foreground">
                Link to an existing customer & vehicle, then set the appointment details:
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer *" error={errors.customerId?.message}>
                  <CustomerSelectWithCreate
                    value={selectedCustomerId}
                    onChange={(id, name) => {
                      setValue('customerId', id, { shouldValidate: true });
                      setValue('vehicleId', '', { shouldValidate: true });
                      setSelectedCustomerName(name ?? '');
                    }}
                    branchId={isSuperAdmin ? undefined : activeBranch?.id}
                  />
                </Field>
                <Field label="Vehicle *" error={errors.vehicleId?.message}>
                  <VehicleSelectWithCreate
                    value={watch('vehicleId')}
                    customerId={selectedCustomerId}
                    onChange={(id) => setValue('vehicleId', id, { shouldValidate: true })}
                    onVehicleSelect={(v) => {
                      const ownerId = v.customer?.id ?? '';
                      if (ownerId) setValue('customerId', ownerId, { shouldValidate: true });
                    }}
                    branchId={isSuperAdmin ? undefined : activeBranch?.id}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Scheduled Date & Time *" error={errors.scheduledAt?.message}>
                  <Controller
                    control={control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <DateTimeInput value={field.value} onChange={field.onChange} />
                    )}
                  />
                </Field>
                <Field label="Service (optional)" error={errors.serviceId?.message}>
                  <select className={inputCls} {...register('serviceId')}>
                    <option value="">Select a service</option>
                    {services?.services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Review Notes (optional)" error={errors.reviewNotes?.message}>
                <textarea
                  className="min-h-16 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Internal note about this approval…"
                  {...register('reviewNotes')}
                />
              </Field>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('details')}
                >
                  Back
                </Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Review & Confirm
                </Button>
              </div>
            </form>
          )}

          {step === 'approve-confirm' && approveFormValues && (
            <ApproveConfirmDialog
              customerName={selectedCustomerName || approveFormValues.customerId}
              scheduledAt={approveFormValues.scheduledAt}
              onConfirm={confirmApprove}
              onBack={() => setStep('approve-form')}
              isPending={reviewEnquiry.isPending}
            />
          )}

          {step === 'reject-confirm' && (
            <RejectConfirmDialog
              onConfirm={confirmReject}
              onCancel={() => setStep('details')}
              isPending={reviewEnquiry.isPending}
            />
          )}
        </>
      )}
    </div>
  );
}