import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createEnquiryRequest } from '../api/enquiry.api';
import type { CreateEnquiryPayload, CreateEnquiryResponse } from '../types/enquiry.types';
import axios from 'axios';

export function useCreateEnquiry() {
  return useMutation<CreateEnquiryResponse, Error, CreateEnquiryPayload>({
    mutationFn: createEnquiryRequest,
    onError: (error) => {
      // Surface the server's validation message if available
      let message = 'Something went wrong. Please try again.';
      if (axios.isAxiosError(error)) {
        message = error.response?.data?.message ?? message;
        if (error.response?.status === 429) {
          message = 'Too many requests. Please wait a few minutes before trying again.';
        }
      }
      toast.error(message);
    },
    // onSuccess is handled at the component level to show the confirmation state
  });
}