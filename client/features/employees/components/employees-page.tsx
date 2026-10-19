"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { downloadExcel } from "@/lib/table-actions";

type MasterRef = { id: string; code: string; description: string } | null;

type Employee = {
  id: string;
  code: string;
  name: string;
  branchId: string;
  designationId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  employeeType: "OWN" | "CONTRACT";
  grade?: "SENIOR" | "JUNIOR" | null;
  dateOfBirth?: string | null;
  qualification?: string | null;
  bloodGroup?: string | null;
  experienceYears?: number | null;
  block?: string | null;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  pin?: string | null;
  phone?: string | null;
  joinDate?: string | null;
  leftDate?: string | null;
  userId?: string | null;
  branch?: { id: string; name: string; code?: string | null };
  designation?: MasterRef;
  department?: MasterRef;
  team?: MasterRef;
  user?: { id: string; email: string; firstName: string; lastName: string } | null;
};

const empty: Employee = {
  id: "",
  code: "",
  name: "",
  branchId: "",
  employeeType: "OWN",
};

const textFields = [
  ["qualification", "Qualification"],
  ["bloodGroup", "Blood group"],
  ["phone", "Phone"],
  ["block", "Block"],
  ["street", "Street"],
  ["district", "District"],
  ["city", "City"],
  ["state", "State"],
  ["pin", "Pin"],
] as const;

const dateFields = [
  ["dateOfBirth", "Date of birth"],
  ["joinDate", "Join date"],
  ["leftDate", "Left on"],
] as const;

const day = (value?: string | null) => value ? value.slice(0, 10) : "";
const masterLabel = (value?: MasterRef) => value ? `${value.code} | ${value.description}` : "";

export function EmployeesPage() {
  const {
    user,
    hasPermission,
  } = useAuth();

  const canManage = hasPermission("employee:manage");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("CURRENT");
  const [teamId, setTeamId] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<Employee | null>(null);
  const filters = `status=${status}&search=${encodeURIComponent(search)}${teamId ? `&teamId=${teamId}` : ""}`;

  const query = useQuery({
    queryKey: ["employees", filters, page],

    queryFn: () => apiGet<{
      items: Employee[];
      meta: {
        total: number;
        totalPages: number;
      };
    }>(`/employees?${filters}&page=${page}&limit=20`),
  });

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
        ...Object.fromEntries(textFields.map(([key]) => [key, record[key] || null])),
        ...Object.fromEntries(dateFields.map(([key]) => [key, record[key] || null])),
      };

      return record.id ? apiPut(`/employees/${record.id}`, payload) : apiPost("/employees", {
        ...payload,
        code: record.code,
        branchId: record.branchId,
      });
    },

    onSuccess: () => {
      setForm(null);

      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });
    },
  });

  async function exportAll() {
    const data = await apiGet<{ items: Employee[] }>(`/employees?${filters}&page=1&limit=100`);

    downloadExcel(`dana-motors-employees-${new Date().toISOString().slice(0, 10)}`, data.items.map(row => ({
      code: row.code,
      name: row.name,
      branch: row.branch?.name,
      designation: masterLabel(row.designation),
      department: masterLabel(row.department),
      team: masterLabel(row.team),
      type: row.employeeType,
      grade: row.grade,
      joinDate: day(row.joinDate),
      leftDate: day(row.leftDate),
      login: row.user?.email,
    })), [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "branch", label: "Branch" },
      { key: "designation", label: "Designation" },
      { key: "department", label: "Department" },
      { key: "team", label: "Group" },
      { key: "type", label: "Type" },
      { key: "grade", label: "Senior/Junior" },
      { key: "joinDate", label: "Joined" },
      { key: "leftDate", label: "Left" },
      { key: "login", label: "Login" },
    ]);
  }

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

  return (
    <div className="grid gap-5 p-4 lg:p-6">
      <PageHeader
        title="Employees"
        description="Workshop employees, with or without a login. Job cards name mechanics and groups from this list." />
      <div className="flex flex-wrap gap-3"><input
          aria-label="Search employees"
          className={`${inputCls} max-w-xs`}
          value={search}
          placeholder="Search code or name"
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }} /><select
          aria-label="Employee status"
          className={`${inputCls} max-w-[12rem]`}
          value={status}
          onChange={e => {
            setStatus(e.target.value);
            setPage(1);
          }}><option value="CURRENT">Current</option><option value="LEFT">Left</option><option value="ALL">All</option></select><div className="min-w-[16rem]"><WorkshopPicker
            label="Group"
            endpoint="/workshop-masters?kind=TEAM"
            collection="items"
            value={teamId}
            onChange={id => {
              setTeamId(id);
              setPage(1);
            }} /></div><Button variant="outline" className="gap-1.5 self-end" onClick={exportAll}><Download className="size-4" />Export</Button>{canManage && <Button
          className="self-end"
          onClick={() => setForm({
            ...empty,
            branchId: user?.branchId ?? "",
          })}>Add employee</Button>}</div>
      {query.isError && <p role="alert" className="text-red-600">Could not load employees. <button onClick={() => query.refetch()}>Retry</button></p>}
      <DataTable
        data={query.data?.items ?? []}
        rowKey={row => row.id}
        isLoading={query.isLoading}
        page={page}
        pageSize={20}
        total={query.data?.meta.total}
        totalPages={query.data?.meta.totalPages}
        onPageChange={setPage}
        columns={[{
          header: "Code",
          render: row => row.code,
        }, {
          header: "Name",
          render: row => row.name,
        }, {
          header: "Designation",
          render: row => row.designation?.description ?? "",
        }, {
          header: "Group",
          render: row => row.team?.description ?? "",
        }, {
          header: "Branch",
          render: row => row.branch?.name ?? "",
        }, {
          header: "Type",
          render: row => row.employeeType === "OWN" ? "Own" : "Contractual",
        }, {
          header: "Status",
          render: row => {
            const left = !!row.leftDate && new Date(row.leftDate) <= new Date();
            return <StatusBadge status={left ? `Left ${day(row.leftDate)}` : "Current"} tone={left ? "gray" : "emerald"} />;
          },
        }, {
          header: "Actions",
          render: row => canManage && <Button variant="outline" size="sm" onClick={() => setForm(row)}>Edit</Button>,
        }]} />
      <ModalFame isOpen={!!form} size="wide" title={form?.id ? `Edit ${form.code}` : "Add employee"} onClose={() => setForm(null)}>{form && <form
          className="grid gap-4 p-5"
          onSubmit={e => {
            e.preventDefault();
            save.mutate(form);
          }}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Employee code"><input
                required
                maxLength={20}
                disabled={!!form.id}
                className={inputCls}
                value={form.code}
                onChange={e => setForm({
                  ...form,
                  code: e.target.value.toUpperCase(),
                })} /></Field>
            <div className="md:col-span-2"><Field label="Employee name"><input
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
            {masterPicker("designationId", "Designation", "DESIGNATION")}
            {masterPicker("departmentId", "Department", "DEPARTMENT")}
            {masterPicker("teamId", "Group", "TEAM")}
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
            {dateFields.map(([key, label]) => <Field key={key} label={label}><input
                type="date"
                className={inputCls}
                value={day(form[key])}
                onChange={e => setForm({
                  ...form,
                  [key]: e.target.value || null,
                })} /></Field>)}
            {textFields.map(([key, label]) => <Field key={key} label={label}><input
                className={inputCls}
                value={form[key] ?? ""}
                onChange={e => setForm({
                  ...form,
                  [key]: e.target.value,
                })} /></Field>)}
            {hasPermission("user:read") && <WorkshopPicker
              label="Login account"
              endpoint={`/admin/users${form.branchId ? `?branchId=${form.branchId}` : ""}`}
              collection="users"
              value={form.userId ?? ""}
              selectedRecord={form.user ?? undefined}
              onChange={id => setForm({
                ...form,
                userId: id || null,
              })} />}
          </div>
          {save.isError && <p role="alert" className="text-red-600">{save.error instanceof Error ? save.error.message : "Could not save the employee."}</p>}
          <Button disabled={save.isPending}>Save employee</Button>
        </form>}</ModalFame>
    </div>
  );
}
