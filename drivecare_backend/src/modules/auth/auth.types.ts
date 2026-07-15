export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
  };
}

export interface UserSession {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
}
