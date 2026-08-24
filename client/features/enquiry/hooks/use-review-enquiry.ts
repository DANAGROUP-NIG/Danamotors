import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { reviewEnquiryRequest } from '../api/enquiry.api';
import { enquiryKeys } from '../api/enquiry.keys';
import { appointmentKeys } from '@/features/appointments/api/appointment.keys';
import type { ReviewEnquiryPayload } from '../types/enquiry.types';
import axios from 'axios';

export function useReviewEnquiry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewEnquiryPayload }) =>
      reviewEnquiryRequest(id, payload),

    onSuccess: (data, variables) => {
      const action = variables.payload.action;
      const name = `${data.enquiry.firstName} ${data.enquiry.lastName}`;

      toast.success(
        action === 'approve'
          ? `Enquiry approved — appointment created for ${name}.`
          : `Enquiry rejected.`,
      );

      // Invalidate enquiry list and appointment list
      queryClient.invalidateQueries({ queryKey: enquiryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
    },

    onError: (error) => {
      let message = 'Failed to process the enquiry. Please try again.';
      if (axios.isAxiosError(error)) {
        message = error.response?.data?.message ?? message;
      }
      toast.error(message);
    },
  });
}