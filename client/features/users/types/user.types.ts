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
};

export type UserWithRole = User & {
  role: { id: string; name: string; permissions: string[] };
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
  roleId: string;
  branchName: string;
};

export type UpdateUserPayload = {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  roleId?: string;
  isActive?: boolean;
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
