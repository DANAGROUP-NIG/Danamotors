"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { copyToClipboard } from "@/lib/table-actions";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { DetailCard, DetailField } from "@/features/branches/components/branch-detail-page";
import { useEmployee } from "../hooks/use-employee";
import { EmployeeFormModal } from "./employee-form-modal";
import { day, employeeAddress, employeeTypeLabel, gradeLabel, hasLeft, masterLabel, type Employee } from "../types/employee.types";

export function EmployeeDetailPage({ id }: { id: string }) {
  const { data, isLoading, isError } = useEmployee(id);
  const { hasPermission } = useAuth();
  const [editing, setEditing] = useState<Employee | null>(null);
  const employee = data?.item;

  const back = (
    <Link href="/employees" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Back to Employees
    </Link>
  );

  if (isLoading) return <LoadingSkeleton variant="detail" />;

  if (isError || !employee) {
    return (
      <div className="grid gap-4 p-4 lg:p-6">
        {back}
        <p className="text-sm text-red-500">Employee not found.</p>
      </div>
    );
  }

  const left = hasLeft(employee);

  return (
    <div className="grid gap-5 p-4 lg:p-6">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <span className="inline-grid size-12 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {employee.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{employee.name}</h1>
              <span className="font-mono text-sm text-muted-foreground">{employee.code}</span>
              <StatusBadge status={left ? `Left ${day(employee.leftDate)}` : "Current"} tone={left ? "gray" : "emerald"} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[employee.designation?.description, employee.team?.description, employee.branch?.name].filter(Boolean).join(" · ") || "No designation or group"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => copyToClipboard(window.location.href, "Employee link copied")}>
            <Link2 className="size-4" /> Copy link
          </Button>
          {hasPermission("employee:manage") && (
            <Button size="sm" className="gap-1.5" onClick={() => setEditing(employee)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      <DetailCard title="Work">
        <DetailField label="Branch" value={employee.branch && <Link href={`/branches/${employee.branch.id}`} className="text-primary hover:underline">{employee.branch.name}</Link>} />
        <DetailField label="Designation" value={masterLabel(employee.designation)} />
        <DetailField label="Department" value={masterLabel(employee.department)} />
        <DetailField label="Group" value={masterLabel(employee.team)} />
        <DetailField label="Employee type" value={employeeTypeLabel(employee)} />
        <DetailField label="Senior / Junior" value={gradeLabel(employee)} />
        <DetailField label="Experience" value={employee.experienceYears != null ? `${employee.experienceYears} years` : undefined} />
        <DetailField label="Joined" value={day(employee.joinDate)} />
        <DetailField label="Left on" value={day(employee.leftDate)} />
      </DetailCard>

      <DetailCard title="Personal">
        <DetailField label="Phone" value={employee.phone} />
        <DetailField label="Date of birth" value={day(employee.dateOfBirth)} />
        <DetailField label="Qualification" value={employee.qualification} />
        <DetailField label="Blood group" value={employee.bloodGroup} />
        <div className="sm:col-span-2">
          <DetailField label="Address" value={employeeAddress(employee)} />
        </div>
      </DetailCard>

      <DetailCard title="Login">
        <DetailField
          label="Login account"
          value={employee.user && (hasPermission("user:read")
            ? <Link href={`/users/${employee.user.id}`} className="text-primary hover:underline">{employee.user.firstName} {employee.user.lastName} ({employee.user.email})</Link>
            : `${employee.user.firstName} ${employee.user.lastName} (${employee.user.email})`)} />
      </DetailCard>

      <EmployeeFormModal employee={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
