export type MasterRef = { id: string; code: string; description: string } | null;

export type Employee = {
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
  createdAt?: string;
  updatedAt?: string;
  branch?: { id: string; name: string; code?: string | null };
  designation?: MasterRef;
  department?: MasterRef;
  team?: MasterRef;
  user?: { id: string; email: string; firstName: string; lastName: string } | null;
};

export type EmployeePage = { items: Employee[]; meta: { total: number; totalPages: number } };

export const emptyEmployee: Employee = {
  id: "",
  code: "",
  name: "",
  branchId: "",
  employeeType: "OWN",
};

export const day = (value?: string | null) => value ? value.slice(0, 10) : "";
export const masterLabel = (value?: MasterRef) => value ? `${value.code} | ${value.description}` : "";
export const hasLeft = (row: Employee) => !!row.leftDate && new Date(row.leftDate) <= new Date();
export const employeeTypeLabel = (row: Employee) => row.employeeType === "OWN" ? "Own" : "Contractual";
export const gradeLabel = (row: Employee) => row.grade === "SENIOR" ? "Senior" : row.grade === "JUNIOR" ? "Junior" : "";
export const employeeAddress = (row: Employee) =>
  [row.block, row.street, row.district, row.city, row.state, row.pin].filter(Boolean).join(", ");

/** Work details only: personal data (date of birth, address, blood group) is never shared. */
export function formatEmployeeText(row: Employee) {
  return [
    `*${row.name}* (${row.code})`,
    `Designation: ${row.designation?.description ?? "N/A"}`,
    `Group: ${row.team?.description ?? "N/A"}`,
    `Branch: ${row.branch?.name ?? "N/A"}`,
    `Phone: ${row.phone ?? "N/A"}`,
    `Status: ${hasLeft(row) ? `Left ${day(row.leftDate)}` : "Current"}`,
  ].join("\n");
}

/** Columns for CSV / Excel exports. */
export const employeeExportColumns = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "branch", label: "Branch" },
  { key: "designation", label: "Designation" },
  { key: "department", label: "Department" },
  { key: "team", label: "Group" },
  { key: "type", label: "Type" },
  { key: "grade", label: "Senior/Junior" },
  { key: "phone", label: "Phone" },
  { key: "joinDate", label: "Joined" },
  { key: "leftDate", label: "Left" },
  { key: "login", label: "Login" },
];

export function employeeExportRow(row: Employee) {
  return {
    code: row.code,
    name: row.name,
    branch: row.branch?.name,
    designation: masterLabel(row.designation),
    department: masterLabel(row.department),
    team: masterLabel(row.team),
    type: employeeTypeLabel(row),
    grade: gradeLabel(row),
    phone: row.phone ?? "",
    joinDate: day(row.joinDate),
    leftDate: day(row.leftDate),
    login: row.user?.email ?? "",
  };
}
