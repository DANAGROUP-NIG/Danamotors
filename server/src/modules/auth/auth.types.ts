export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    role: string;
    permissions: string[];
    branchId?: string | null;
  };
}

export interface UserSession {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
}
