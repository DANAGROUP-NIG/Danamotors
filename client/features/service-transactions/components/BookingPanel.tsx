"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, inputCls } from '@/components/forms/FormField';
import { DateTimeInput } from '@/components/forms/DateTimeInput';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useUpdateAppointment } from '@/features/appointments/hooks/use-update-appointment';
import type { Appointment, BookingExtra } from '@/features/appointments/types/appointment.types';
import { JobCardOpeningModal } from '@/features/job-cards/components/JobCardOpeningModal';
import { WorkshopPicker } from '@/features/job-cards/components/WorkshopPicker';
import { BookingFields } from './BookingFields';
import { bookingExtras, bookingOpeningValues } from "../booking.logic";
import { canEditBooking, lagosDate, lagosInput, lagosIso, moneyText } from '../transaction.logic';
export function BookingPanel({ appointment }: { appointment: Appointment }) {
  const { hasPermission } = useAuth();
  const update = useUpdateAppointment(appointment.id);
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<BookingExtra>(() => bookingExtras(appointment));
  const [scheduled, setScheduled] = useState(lagosInput(appointment.scheduledAt));
  const [serviceTypeId, setServiceTypeId] = useState(appointment.serviceTypeId ?? '');
  const [reason, setReason] = useState('');
  const editable = hasPermission('appointment:update') && canEditBooking(appointment);
  return <section className="mb-6 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground">
    <h2 className="text-lg font-semibold">Service booking</h2>
    <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Booking number</dt><dd className="break-all">{appointment.bookingNumber ?? 'Legacy booking'}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd>{appointment.bookingStatus ?? appointment.status}</dd></div><div><dt className="text-muted-foreground">Booked on (Lagos)</dt><dd>{lagosDate(appointment.createdAt)}</dd></div></dl>
    {appointment.cancelReason && <p className="text-sm">Cancellation reason: {appointment.cancelReason}</p>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); update.mutate({ ...extra, serviceTypeId: serviceTypeId || undefined, scheduledAt: lagosIso(scheduled) }); }}>
      <Field label="Booked for (Lagos)"><DateTimeInput disabled={!editable || update.isPending} value={scheduled} onChange={setScheduled} /></Field>
      <WorkshopPicker label="Workshop service type" endpoint="/workshop-masters?kind=SERVICE_TYPE" collection="items" value={serviceTypeId} onChange={setServiceTypeId} disabled={!editable || update.isPending} />
      <BookingFields value={extra} onChange={setExtra} vehicleId={appointment.vehicleId} disabled={!editable || update.isPending} />
      {editable && <Button disabled={update.isPending}>{update.isPending ? 'Saving?' : 'Save booking details'}</Button>}
    </form>
    {appointment.totals && <dl className="grid gap-3 text-sm sm:grid-cols-4">{Object.entries(appointment.totals).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key.replace('estimated', '').replace('Total', 'Total estimate') || key}</dt><dd>{moneyText(value)}</dd></div>)}</dl>}
    {editable && <div className="flex flex-wrap items-end gap-3"><Field label="Cancellation reason"><input className={inputCls} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button type="button" variant="outline" disabled={update.isPending || !reason.trim()} onClick={() => update.mutate({ bookingStatus: 'CANCELLED', cancelReason: reason.trim() })}>Cancel booking</Button><Button type="button" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ bookingStatus: 'NO_SHOW' })}>Mark no-show</Button></div>}
    {editable && hasPermission('jobcard:create') && <Button type="button" onClick={() => setOpen(true)}>Convert to job card</Button>}
    {(appointment.jobCards ?? []).map(card => { const linked = card as { id: string; jobNumber?: string }; return <Link key={linked.id} href={`/job-cards/${linked.id}`} className="block text-sm underline">Open job {linked.jobNumber ?? linked.id}</Link>; })}
    <JobCardOpeningModal isOpen={open} onClose={() => setOpen(false)} defaultValues={bookingOpeningValues(appointment)} />
  </section>;
}
