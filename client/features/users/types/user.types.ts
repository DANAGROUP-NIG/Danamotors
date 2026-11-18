export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roleId: string;
  role: { id: string; name: string };
  branchId?: string;
  branch?: { id: string; name: string } | null;
  /** How many grants and denials the user has on top of the role (list only). */
  _count?: { permissionOverrides?: number };
};

export type PermissionOverride = { name: string; effect: "GRANT" | "DENY" };

export type UserWithRole = User & {
  role: { id: string; name: string; permissions: string[] };
  /** The user's own grants and denials on top of the role. */
  overrides: PermissionOverride[];
  /** Role + granted − denied. */
  effectivePermissions: string[];
  /** Admin, SuperAdmin, a role that manages access (Auditor), or an admin-level grant. */
  adminLevel: boolean;
};

export type Role = {
  id: string;
  name: string;
  description?: string;
  _count?: { permissions: number };
};

export type CreateUserPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  roleId?: string;
  /** Give the new user this user's role and overrides. */
  copyFromUserId?: string;
  branchName: string;
};

export type UpdateUserPayload = {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  roleId?: string;
  /** Super admin only: moves the user to another branch. */
  branchId?: string;
  isActive?: boolean;
  /** Replace the role and overrides with this user's. */
  copyFromUserId?: string;
};

export type UserListResponse = {
  users: User[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
