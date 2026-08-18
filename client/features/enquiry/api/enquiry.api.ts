import axios from 'axios';
import type { CreateEnquiryPayload, CreateEnquiryResponse } from '../types/enquiry.types';

// NOTE: Use a plain axios instance (NOT the authenticated one) for the public endpoint.
// This avoids adding a Bearer token to an unauthenticated route.
const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
});

export async function createEnquiryRequest(
  payload: CreateEnquiryPayload,
): Promise<CreateEnquiryResponse> {
  const { data } = await publicApi.post<{
    status: string;
    statusCode: number;
    message: string;
    data: CreateEnquiryResponse;
  }>('/enquiries', payload);
  return data.data;
}