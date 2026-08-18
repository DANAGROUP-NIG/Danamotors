'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Calendar, Clock, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, inputCls } from '@/components/forms/FormField';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { useCreateEnquiry } from '@/features/enquiry/hooks/use-create-enquiry';
import { createEnquirySchema, type CreateEnquiryFormValues } from '@/features/enquiry/schemas/enquiry.schema';
import { BookingDatePicker } from './BookingDatePicker';

export default function BookingSection() {
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const createEnquiry = useCreateEnquiry();
  
  const { data: branchesData, isLoading: branchesLoading } = useBranches();
  const branches = branchesData?.branches ?? [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateEnquiryFormValues>({
    resolver: zodResolver(createEnquirySchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      vehicleMake: '',
      vehicleModel: '',
      vehicleRegNumber: '',
      serviceDescription: '',
      branchId: '',
    },
  });

  function onSubmit(values: CreateEnquiryFormValues) {
    const payload = {
      ...values,
      preferredDate: selectedDate?.toISOString(),
      vehicleYear: values.vehicleYear ? Number(values.vehicleYear) : undefined,
      // Strip optional empty strings to undefined
      vehicleMake: values.vehicleMake || undefined,
      vehicleModel: values.vehicleModel || undefined,
      vehicleRegNumber: values.vehicleRegNumber || undefined,
    };

    createEnquiry.mutate(payload, {
      onSuccess: (data) => {
        setConfirmedId(data.enquiry.id);
        reset();
        setSelectedDate(undefined);
      },
    });
  }

  // Handle loading state for branches
  const isBranchesLoading = branchesLoading;
  

  return (
    <section id="book" className="relative py-20 sm:py-28 overflow-hidden">
      {/* Background decoration */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(99,102,241,0.08), transparent)',
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-500">
            Book a Service
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Schedule Your Vehicle Service
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Tell us about your vehicle and what you need. Our team will confirm your
            appointment and reach out within 24 hours.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Left column: date picker + info cards */}
          <div className="flex flex-col gap-6">
            <BookingDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            {/* Trust signals */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { icon: Clock, label: 'Quick Response', desc: 'We confirm within 24 hours' },
                { icon: MapPin, label: 'Multiple Locations', desc: 'Branches across the city' },
                { icon: Calendar, label: 'Flexible Scheduling', desc: 'Morning & afternoon slots' },
              ].map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/60 p-4 backdrop-blur-sm"
                >
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                    <Icon className="size-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: form / confirmation */}
          <Card className="rounded-2xl border-border/50 shadow-xl shadow-blue-950/5">
            <CardHeader>
              <CardTitle className="font-display text-xl">Send a Service Request</CardTitle>
             
            </CardHeader>

            <CardContent>
              <AnimatePresence mode="wait">
                {confirmedId ? (
                  /* ── Confirmation State ─────────────────────────────────── */
                  <motion.div
                    key="confirmed"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col items-center gap-4 py-10 text-center"
                  >
                    <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
                      <CheckCircle2 className="size-8 text-emerald-500" />
                    </div>
                    <h3 className="font-display text-xl font-semibold text-foreground">
                      Enquiry Received!
                    </h3>
                    <p className="max-w-xs text-sm text-muted-foreground">
                      Your service request has been submitted successfully. Our customer care
                      team will contact you within 24 hours to confirm your appointment.
                    </p>
                    <p className="mt-1 rounded-lg bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
                      Reference: {confirmedId.slice(0, 8).toUpperCase()}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setConfirmedId(null)}
                    >
                      Submit Another Request
                    </Button>
                  </motion.div>
                ) : (
                  /* ── Booking Form ────────────────────────────────────────── */
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="grid gap-4"
                    onSubmit={handleSubmit(onSubmit)}
                    noValidate
                  >
                    {/* Name row */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="First Name *" error={errors.firstName?.message}>
                        <input
                          id="enquiry-first-name"
                          className={inputCls}
                          placeholder="e.g. Amaka"
                          autoComplete="given-name"
                          {...register('firstName')}
                        />
                      </Field>
                      <Field label="Last Name *" error={errors.lastName?.message}>
                        <input
                          id="enquiry-last-name"
                          className={inputCls}
                          placeholder="e.g. Okafor"
                          autoComplete="family-name"
                          {...register('lastName')}
                        />
                      </Field>
                    </div>

                    {/* Contact row */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Email Address *" error={errors.email?.message}>
                        <input
                          id="enquiry-email"
                          type="email"
                          className={inputCls}
                          placeholder="you@example.com"
                          autoComplete="email"
                          {...register('email')}
                        />
                      </Field>
                      <Field label="Phone Number *" error={errors.phoneNumber?.message}>
                        <input
                          id="enquiry-phone"
                          type="tel"
                          className={inputCls}
                          placeholder="+234 801 234 5678"
                          autoComplete="tel"
                          {...register('phoneNumber')}
                        />
                      </Field>
                    </div>

                    {/* Vehicle row */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Vehicle Make" error={errors.vehicleMake?.message}>
                        <input
                          id="enquiry-make"
                          className={inputCls}
                          placeholder="e.g. Toyota"
                          {...register('vehicleMake')}
                        />
                      </Field>
                      <Field label="Vehicle Model" error={errors.vehicleModel?.message}>
                        <input
                          id="enquiry-model"
                          className={inputCls}
                          placeholder="e.g. Camry"
                          {...register('vehicleModel')}
                        />
                      </Field>
                      <Field label="Reg. Number" error={errors.vehicleRegNumber?.message}>
                        <input
                          id="enquiry-reg"
                          className={inputCls}
                          placeholder="e.g. LND 123 AB"
                          {...register('vehicleRegNumber')}
                        />
                      </Field>
                    </div>

                    {/* Branch selection */}
                    <Field 
                      label="Preferred Branch *" 
                     
                    >
                      <select
                        id="enquiry-branch"
                        className={inputCls}
                        disabled={isBranchesLoading }
                        {...register('branchId')}
                      >
                        <option value="">
                          Select a branch
                        </option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}{b.city ? ` (${b.city})` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>

                    {/* Service description */}
                    <Field
                      label="Describe the Service You Need *"
                      error={errors.serviceDescription?.message}
                    >
                      <textarea
                        id="enquiry-description"
                        className={inputCls}
                        style={{ minHeight: '100px' }}
                        placeholder="e.g. Engine makes a knocking sound when idling. Also need an oil change."
                        maxLength={500}
                        {...register('serviceDescription')}
                      />
                    </Field>

                    {/* Submit */}
                    <Button
                      id="enquiry-submit"
                      type="submit"
                      size="lg"
                      disabled={createEnquiry.isPending || isSubmitting}
                      className="mt-1 w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-900/20 transition-all duration-200"
                    >
                      {createEnquiry.isPending || isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Sending Request…
                        </>
                      ) : (
                        'Send Service Request'
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                      No account required. We'll contact you to confirm the details.
                    </p>
                  </motion.form>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}