"use client";
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/apiClient';
import type { OpeningConsentDocument } from '../booking-opening-consent.logic';

export function useBookingOpeningConsent(appointmentId: string) {
  return useQuery({
    queryKey: ['appointments', appointmentId, 'opening-consent'],
    queryFn: () => apiGet<{ consent: OpeningConsentDocument }>(`/service/appointments/${appointmentId}/opening-consent`),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
