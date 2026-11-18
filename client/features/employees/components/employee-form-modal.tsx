"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiPut } from "@/lib/api/apiClient";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { day, type Employee } from "../types/employee.types";

type TextKey = "qualification" | "bloodGroup" | "phone" | "block" | "street" | "district" | "city" | "state" | "pin";
type DateKey = "dateOfBirth" | "joinDate" | "leftDate";

const personalFields: [TextKey, string][] = [
  ["phone", "Phone"],
  ["qualification", "Qualification"],
  ["bloodGroup", "Blood group"],
];

const addressFields: [TextKey, string][] = [
  ["block", "Block"],
  ["street", "Street"],
  ["district", "District"],
  ["city", "City"],
  ["state", "State"],
  ["pin", "Pin"],
];

const textKeys = [...personalFields, ...addressFields].map(([key]) => key);
const dateKeys: DateKey[] = ["dateOfBirth", "joinDate", "leftDate"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/** Add or edit an employee. Pass `employee` with an empty id to add one; null closes the modal. */
export function EmployeeFormModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Employee | null>(employee);

  const save = useMutation({
    mutationFn: (record: Employee) => {
      const payload = {
        name: record.name,
        designationId: record.designationId || null,
        departmentId: record.departmentId || null,
        teamId: record.teamId || null,
        employeeType: record.employeeType,
        grade: record.grade || null,
        experienceYears: record.experienceYears ?? null,
        userId: record.userId || null,
        ...Object.fromEntries(textKeys.map(key => [key, record[key] || null])),
        ...Object.fromEntries(dateKeys.map(key => [key, record[key] || null])),
      };

      return record.id ? apiPut(`/employees/${record.id}`, payload) : apiPost("/employees", {
        ...payload,
        code: record.code,
        branchId: record.branchId,
      });
    },

    onSuccess: () => {
      // Refreshes the list and any open employee detail page.
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      onClose();
    },
  });

  // Start fresh each time the modal opens for a (different) employee.
  const { reset } = save;
  useEffect(() => {
    setForm(employee);
    reset();
  }, [employee, reset]);

  const masterPicker = (key: "designationId" | "departmentId" | "teamId", label: string, kind: string) => form && <WorkshopPicker
    label={label}
    endpoint={`/workshop-masters?kind=${kind}`}
    collection="items"
    value={form[key] ?? ""}
    selectedRecord={form[key.replace("Id", "") as "designation" | "department" | "team"] ?? undefined}
    onChange={id => setForm({
      ...form,
      [key]: id || null,
    })} />;

  const textInput = ([key, label]: [TextKey, string]) => form && <Field key={key} label={label}><input
      className={inputCls}
      value={form[key] ?? ""}
      onChange={e => setForm({
        ...form,
        [key]: e.target.value,
      })} /></Field>;

  const dateInput = (key: DateKey, label: string) => form && <Field label={label}><input
      type="date"
      className={inputCls}
      value={day(form[key])}
      onChange={e => setForm({
        ...form,
        [key]: e.target.value || null,
      })} /></Field>;

  return (
    <ModalFame isOpen={!!employee} size="wide" title={employee?.id ? `Edit ${employee.code} · ${employee.name}` : "Add employee"} onClose={onClose}>{form && <form
        className="grid gap-4 p-5"
        onSubmit={e => {
          e.preventDefault();
          save.mutate(form);
        }}>
        <Section title="Employee">
          <Field label="Employee code" required><input
              required
              maxLength={20}
              disabled={!!form.id}
              className={inputCls}
              value={form.code}
              onChange={e => setForm({
                ...form,
                code: e.target.value.toUpperCase(),
              })} /></Field>
          <div className="sm:col-span-1 lg:col-span-2"><Field label="Employee name" required><input
              required
              maxLength={150}
              className={inputCls}
              value={form.name}
              onChange={e => setForm({
                ...form,
                name: e.target.value,
              })} /></Field></div>
          <WorkshopPicker
            required
            label="Branch"
            endpoint="/branches"
            collection="branches"
            value={form.branchId}
            disabled={!!form.id}
            selectedRecord={form.branch}
            onChange={id => setForm({
              ...form,
              branchId: id,
            })} />
          <Field label="Employee type"><select
              className={inputCls}
              value={form.employeeType}
              onChange={e => setForm({
                ...form,
                employeeType: e.target.value as Employee["employeeType"],
              })}><option value="OWN">Own</option><option value="CONTRACT">Contractual</option></select></Field>
          <Field label="Senior / Junior"><select
              className={inputCls}
              value={form.grade ?? ""}
              onChange={e => setForm({
                ...form,
                grade: (e.target.value || null) as Employee["grade"],
              })}><option value="">Not set</option><option value="SENIOR">Senior</option><option value="JUNIOR">Junior</option></select></Field>
        </Section>

        <Section title="Work">
          {masterPicker("designationId", "Designation", "DESIGNATION")}
          {masterPicker("departmentId", "Department", "DEPARTMENT")}
          {masterPicker("teamId", "Group", "TEAM")}
          <Field label="Experience (years)"><input
              type="number"
              min="0"
              max="80"
              step="0.5"
              className={inputCls}
              value={form.experienceYears ?? ""}
              onChange={e => setForm({
                ...form,
                experienceYears: e.target.value === "" ? null : Number(e.target.value),
              })} /></Field>
          {dateInput("joinDate", "Join date")}
          {dateInput("leftDate", "Left on")}
        </Section>

        <Section title="Personal">
          {dateInput("dateOfBirth", "Date of birth")}
          {personalFields.map(textInput)}
        </Section>

        <Section title="Address">
          {addressFields.map(textInput)}
        </Section>

        {hasPermission("user:read") && (
          <Section title="Login">
            <div className="sm:col-span-2 lg:col-span-3">
              <WorkshopPicker
                label="Login account"
                endpoint={`/admin/users${form.branchId ? `?branchId=${form.branchId}` : ""}`}
                collection="users"
                value={form.userId ?? ""}
                selectedRecord={form.user ?? undefined}
                onChange={id => setForm({
                  ...form,
                  userId: id || null,
                })} />
              <p className="mt-1.5 text-sm text-muted-foreground">Optional. Links this employee to the user who signs in for them.</p>
            </div>
          </Section>
        )}

        {save.isError && <p role="alert" className="text-sm text-red-600">{save.error instanceof Error ? save.error.message : "Could not save the employee."}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save employee"}</Button>
        </div>
      </form>}</ModalFame>
  );
}
