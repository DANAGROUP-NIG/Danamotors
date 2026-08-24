"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Car,
  Building2,
  Clock,
  FileText,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { useEnquiry } from "@/features/enquiry/hooks/use-enquiry";
import { EnquiryReviewModal } from "@/features/enquiry/components/EnquiryReviewModal";
import type { EnquiryStatus } from "@/features/enquiry/types/enquiry.types";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ENQUIRY_REVIEW_ROLES } from "@/features/auth/roles";

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
  const [showReview, setShowReview] = useState(false);
  const { hasAccess } = useAuth();
  const canReview = hasAccess(ENQUIRY_REVIEW_ROLES);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">Loading…</div>
    );
  }

  if (error || !enquiry) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link
          href="/enquiries"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" /> Back to Service &amp; Enquiry Queue
        </Link>
        <p className="text-sm text-red-500">Enquiry not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <Link
        href="/enquiries"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Back to Enquiry Queue
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
              Enquiry
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {new Date(enquiry.createdAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[enquiry.status]}`}
          >
            {enquiry.status}
          </span>
        </div>

        {canReview && (
          <div className="mb-6 flex flex-wrap gap-2">
            {enquiry.status === "Pending" ? (
              <Button
                size="sm"
                onClick={() => setShowReview(true)}
                className="gap-1.5"
              >
                <ClipboardCheck className="size-4" />
                Review &amp; Approve
              </Button>
            ) : (
              <p className="text-sm text-slate-500">
                This enquiry has been {enquiry.status.toLowerCase()}.
                {enquiry.appointment && (
                  <>
                    {" "}
                    <Link
                      href={`/appointments/${enquiry.appointment.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      View appointment →
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <SectionTitle icon={<User className="size-4" />} title="Customer" />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField
                label="Name"
                value={`${enquiry.firstName} ${enquiry.lastName}`}
              />
              <DetailField label="Email" value={enquiry.email} />
              <DetailField label="Phone" value={enquiry.phoneNumber ?? null} />
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle icon={<Car className="size-4" />} title="Vehicle" />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField
                label="Make / Model"
                value={
                  `${enquiry.vehicleMake ?? ""} ${enquiry.vehicleModel ?? ""}`.trim() ||
                  "—"
                }
              />
              <DetailField
                label="Vehicle Reg No"
                value={enquiry.vehicleRegNumber ?? "—"}
              />
              <DetailField
                label="Year"
                value={enquiry.vehicleYear ?? undefined}
              />
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle
              icon={<Building2 className="size-4" />}
              title="Branch"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Branch" value={enquiry.branch?.name ?? "—"} />
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle icon={<Clock className="size-4" />} title="Timing" />
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField
                label="Preferred date"
                value={
                  enquiry.preferredDate
                    ? new Date(enquiry.preferredDate).toLocaleString()
                    : "—"
                }
              />
              <DetailField
                label="Submitted"
                value={new Date(enquiry.createdAt).toLocaleDateString()}
              />
            </div>
          </div>
        </div>

        {enquiry.serviceDescription && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <SectionTitle
              icon={<FileText className="size-4" />}
              title="Message"
            />
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {enquiry.serviceDescription}
            </p>
          </div>
        )}

        {enquiry.reviewedAt && (
          <div className="mt-6 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            Reviewed by{" "}
            <span className="font-medium">
              {enquiry.reviewedBy
                ? `${enquiry.reviewedBy.firstName} ${enquiry.reviewedBy.lastName}`
                : "staff"}
            </span>{" "}
            on {new Date(enquiry.reviewedAt).toLocaleDateString()}
            {enquiry.reviewNotes && (
              <p className="mt-1 text-slate-600">{enquiry.reviewNotes}</p>
            )}
          </div>
        )}
      </div>

      <ModalFame
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        title="Review Enquiry"
      >
        {enquiry && (
          <EnquiryReviewModal
            enquiry={enquiry}
            onClose={() => setShowReview(false)}
          />
        )}
      </ModalFame>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      {icon}
      {title}
    </div>
  );
}
