export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role: string;
  permissions: string[];
  branchId?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  branchName?: string;
};

export type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  currentPassword?: string;
  newPassword?: string;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};
