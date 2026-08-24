'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Calendar, Clock, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
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
    formState: { errors },
  } = useForm<CreateEnquiryFormValues>({
    resolver: zodResolver(createEnquirySchema),
    defaultValues: {
      firstName: '', lastName: '', email: '',
      phoneNumber: '', vehicleMake: '', vehicleModel: '',
      vehicleRegNumber: '', serviceDescription: '', branchId: '',
    },
  });

  function onSubmit(values: CreateEnquiryFormValues) {
    const payload = {
      ...values,
      preferredDate: selectedDate?.toISOString(),
      vehicleYear: values.vehicleYear ? Number(values.vehicleYear) : undefined,
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

  return (
    <section id="book" className="relative overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(59,130,246,0.12), transparent 60%)',
        }}
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,_rgba(15,23,42,0.02),_rgba(15,23,42,0.08))]" aria-hidden />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            Book a Service
          </div>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Schedule Your Vehicle Service
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Tell us about your vehicle and what you need. Our team will confirm your
            appointment and reach out within 24 hours.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col gap-6">
            <BookingDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />

          
          </div>

          <Card className="overflow-hidden rounded-[30px] border border-blue-500/20 bg-gradient-to-b from-card via-card to-background shadow-[0_35px_80px_-40px_rgba(37,99,235,0.5)]">
            <div className="border-b border-border/70 bg-gradient-to-r from-blue-600/10 via-indigo-500/10 to-transparent px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                    Service request
                  </p>
                  <CardTitle className="mt-2 font-display text-2xl text-foreground">
                    Send a Service Request
                  </CardTitle>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30">
                  <Calendar className="size-5" />
                </div>
              </div>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                Fill in your details below — no account required.
              </CardDescription>
            </div>

            <CardContent className="p-5 sm:p-6">
              <AnimatePresence mode="wait">
                {confirmedId ? (
                  <motion.div
                    key="confirmed"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col items-center gap-4 py-10 text-center"
                  >
                    <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                      <CheckCircle2 className="size-8 text-emerald-500" />
                    </div>
                    <h3 className="font-display text-2xl font-semibold text-foreground">
                      Enquiry Received!
                    </h3>
                    <p className="max-w-xs text-sm text-muted-foreground">
                      Your service request has been submitted successfully. Our customer care team will contact you within 24 hours to confirm your appointment.
                    </p>
                    <p className="mt-1 rounded-full bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground ring-1 ring-border">
                      Reference: {confirmedId.slice(0, 8).toUpperCase()}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 rounded-full px-5"
                      onClick={() => setConfirmedId(null)}
                    >
                      Submit Another Request
                    </Button>
                  </motion.div>
                ) : (
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
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="First Name *" error={errors.firstName?.message}>
                        <input
                          id="enquiry-first-name"
                          className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                          placeholder="e.g. Amaka"
                          autoComplete="given-name"
                          {...register('firstName')}
                        />
                      </Field>
                      <Field label="Last Name *" error={errors.lastName?.message}>
                        <input
                          id="enquiry-last-name"
                          className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                          placeholder="e.g. Okafor"
                          autoComplete="family-name"
                          {...register('lastName')}
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Email Address *" error={errors.email?.message}>
                        <input
                          id="enquiry-email"
                          type="email"
                          className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                          placeholder="you@example.com"
                          autoComplete="email"
                          {...register('email')}
                        />
                      </Field>
                      <Field label="Phone Number *" error={errors.phoneNumber?.message}>
                        <input
                          id="enquiry-phone"
                          type="tel"
                          className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                          placeholder="+234 801 234 5678"
                          autoComplete="tel"
                          {...register('phoneNumber')}
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Vehicle Make" error={errors.vehicleMake?.message}>
                        <input
                          id="enquiry-make"
                          className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                          placeholder="e.g. Toyota"
                          {...register('vehicleMake')}
                        />
                      </Field>
                      <Field label="Vehicle Model" error={errors.vehicleModel?.message}>
                        <input
                          id="enquiry-model"
                          className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                          placeholder="e.g. Camry"
                          {...register('vehicleModel')}
                        />
                      </Field>
                      <Field label="Reg. Number" error={errors.vehicleRegNumber?.message}>
                        <input
                          id="enquiry-reg"
                          className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                          placeholder="e.g. LND 123 AB"
                          {...register('vehicleRegNumber')}
                        />
                      </Field>
                    </div>

                    <Field label="Preferred Branch *" error={errors.branchId?.message}>
                      <select
                        id="enquiry-branch"
                        className={`${inputCls} bg-background/80 focus-visible:ring-blue-500/30`}
                        disabled={branchesLoading}
                        {...register('branchId')}
                      >
                        <option value="">
                          {branchesLoading ? 'Loading branches…' : 'Select a branch'}
                        </option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Describe the Service You Need *" error={errors.serviceDescription?.message}>
                      <textarea
                        id="enquiry-description"
                        className="min-h-28 w-full resize-none rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500/30"
                        placeholder="e.g. Engine makes a knocking sound when idling. Also need an oil change."
                        maxLength={500}
                        {...register('serviceDescription')}
                      />
                    </Field>

                    <Button
                      id="enquiry-submit"
                      type="submit"
                      size="lg"
                      disabled={createEnquiry.isPending}
                      className="mt-1 w-full rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-base font-semibold text-white shadow-[0_16px_35px_-18px_rgba(37,99,235,0.8)] transition-all duration-200 hover:brightness-110"
                    >
                      {createEnquiry.isPending ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Sending Request…
                        </>
                      ) : (
                        'Send Service Request'
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                      No account required. We&apos;ll contact you to confirm the details.
                    </p>
                  </motion.form>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
        
         <div className="grid grid-cols-1 gap-3 mt-10 sm:grid-cols-3">
            {[
              { icon: Clock, label: 'Quick Response', desc: 'We confirm within 24 hours' },
              { icon: MapPin, label: 'Multiple Locations', desc: 'Branches across the city' },
              { icon: Calendar, label: 'Flexible Scheduling', desc: 'Morning & afternoon slots' },
            ].map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/75 p-4 backdrop-blur-sm shadow-[0_15px_35px_-25px_rgba(15,23,42,0.7)]"
              >
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/15">
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
    </section>
  );
}