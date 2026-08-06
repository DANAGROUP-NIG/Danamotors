export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  branchId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
export {};
