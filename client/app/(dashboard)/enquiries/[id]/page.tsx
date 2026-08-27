"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  User,
  Mail,
  Phone,
  Building2,
  Car,
  Calendar,
  FileText,
  CheckCircle2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { useEnquiry } from "@/features/enquiry/hooks/use-enquiry";
import { EnquiryReviewModal } from "@/features/enquiry/components/EnquiryReviewModal";
import type { EnquiryStatus } from "@/features/enquiry/types/enquiry.types";
import { useAuth } from "@/features/auth/hooks/use-auth";

const STATUS_BADGE: Record<EnquiryStatus, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
  Converted: "bg-blue-50 text-blue-700",
};

export default function EnquiryPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useEnquiry(id);
  const enquiry = data?.enquiry;
  const [reviewAction, setReviewAction] = useState<
    "approve-form" | "reject-confirm" | null
  >(null);
  const { hasPermission } = useAuth();
  const canReview = hasPermission("customer:update");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  if (error || !enquiry) {
    return (
      <div className="px-4 py-10 lg:px-8">
        <Link
          href="/enquiries"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          Enquiries
        </Link>
        <p className="mt-4 text-sm text-red-500">Enquiry not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-3 text-sm text-slate-500">
          <Link href="/enquiries" className="hover:text-slate-700">
            Enquiries
          </Link>
          <ChevronRight className="h-4 w-4" />
        <span className="font-medium text-slate-600">
          {`ENQ-${String(enquiry.id).slice(0, 4)}`.toUpperCase()}
        </span>
          
        </div>

        <div className="mb-8 flex items-start justify-between gap-4">
          <h1 className="text-[2.2rem] font-semibold tracking-[-0.02em] text-slate-900">
            Enquiry Details
          </h1>

          <span
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-medium ${STATUS_BADGE[enquiry.status]}`}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-current opacity-90" />
            {enquiry.status}
          </span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div className="grid gap-x-14 gap-y-10 p-6 md:grid-cols-2 md:p-8 lg:p-10">
            <InfoItem
              icon={<User className="h-6 w-6 stroke-[1.8]" />}
              label="Name"
              value={`${enquiry.firstName} ${enquiry.lastName}`}
            />

            <InfoItem
              icon={<Mail className="h-6 w-6 stroke-[1.8]" />}
              label="Email"
              value={enquiry.email || "—"}
            />

            <InfoItem
              icon={<Phone className="h-6 w-6 stroke-[1.8]" />}
              label="Phone"
              value={enquiry.phoneNumber || "—"}
            />

            <InfoItem
              icon={<Building2 className="h-6 w-6 stroke-[1.8]" />}
              label="Branch"
              value={enquiry.branch?.name || "—"}
            />

            <InfoItem
              icon={<Car className="h-6 w-6 stroke-[1.8]" />}
              label="Vehicle"
              value={[
                enquiry.vehicleMake,
                enquiry.vehicleModel,
                enquiry.vehicleYear,
                enquiry.vehicleRegNumber ? `- ${enquiry.vehicleRegNumber}` : "",
              ]
                .filter(Boolean)
                .join(" ") || "—"}
            />

            <InfoItem
              icon={<Calendar className="h-6 w-6 stroke-[1.8]" />}
              label="Preferred Date"
              value={
                enquiry.preferredDate
                  ? new Date(enquiry.preferredDate).toLocaleString("en-NG", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "—"
              }
            />
          </div>

          <div className="border-t border-slate-200 px-6 py-6 md:px-8 lg:px-10">
            <InfoItem
              icon={<FileText className="h-6 w-6 stroke-[1.8]" />}
              label="Service Description"
              value={enquiry.serviceDescription || "—"}
              fullWidth
            />
          </div>
        </div>

        {canReview && enquiry.status === "Pending" && (
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Button
              size="lg"
              className="h-16 rounded-2xl bg-emerald-600 px-8 text-lg font-semibold text-white shadow-none hover:bg-emerald-700"
            >
              <Calendar className="mr-3 h-5 w-5" />
              Book Appointment
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => setReviewAction("approve-form")}
              className="h-16 rounded-2xl border-2 border-emerald-500 bg-white px-8 text-lg font-semibold text-emerald-600 hover:bg-emerald-50"
            >
              <CheckCircle2 className="mr-3 h-5 w-5" />
              Approve & Schedule
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => setReviewAction("reject-confirm")}
              className="h-16 rounded-2xl border-2 border-red-400 bg-white px-8 text-lg font-semibold text-red-500 hover:bg-red-50"
            >
              <X className="mr-3 h-5 w-5" />
              Reject
            </Button>
          </div>
        )}

        {canReview && enquiry.status !== "Pending" && (
          <div className="mt-6 text-sm text-slate-500">
            This enquiry has been {enquiry.status.toLowerCase()}.
            {enquiry.appointment && (
              <Link
                href={`/appointments/${enquiry.appointment.id}`}
                className="ml-2 font-medium text-blue-600 hover:underline"
              >
                View appointment
              </Link>
            )}
          </div>
        )}

        {enquiry.reviewedAt && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Reviewed by{" "}
            <span className="font-semibold text-slate-800">
              {enquiry.reviewedBy
                ? `${enquiry.reviewedBy.firstName} ${enquiry.reviewedBy.lastName}`
                : "staff"}
            </span>{" "}
            on {new Date(enquiry.reviewedAt).toLocaleDateString()}
            {enquiry.reviewNotes && (
              <p className="mt-2 text-slate-600">{enquiry.reviewNotes}</p>
            )}
          </div>
        )}
      </div>

      <ModalFame
        isOpen={reviewAction !== null}
        onClose={() => setReviewAction(null)}
        title={
          reviewAction === "reject-confirm"
            ? "Reject Enquiry"
            : "Approve & Schedule"
        }
      >
        {enquiry && reviewAction && (
          <EnquiryReviewModal
            key={reviewAction}
            enquiry={enquiry}
            initialStep={reviewAction}
            onClose={() => setReviewAction(null)}
          />
        )}
      </ModalFame>
    </div>
  );
}

function InfoItem({
  icon,
  label,
  value,
  fullWidth = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "w-full" : ""}>
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>

        <div className="min-w-0 pt-1">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p
            className={`mt-1 text-slate-900 ${
                  fullWidth ? "text-xl leading-snug" : "text-xl leading-tight"
            } font-medium`}
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
