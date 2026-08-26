"use client";

import { InfoIcon } from "lucide-react";

interface EnquiryPrefillBannerProps {
  firstName: string;
  lastName: string;
  email: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleRegNumber: string;
}

export function EnquiryPrefillBanner({
  firstName,
  lastName,
  email,
  vehicleMake,
  vehicleModel,
  vehicleRegNumber,
}: EnquiryPrefillBannerProps) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
      <div className="flex items-start gap-3">
        <InfoIcon className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            ℹ️ Pre-filling from enquiry by {firstName} {lastName} ({email})
          </p>
          <p className="text-blue-700 dark:text-blue-200">
            Vehicle: {vehicleMake} {vehicleModel} — {vehicleRegNumber}
          </p>
        </div>
      </div>
    </div>
  );
}