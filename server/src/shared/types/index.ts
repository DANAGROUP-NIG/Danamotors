export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  branchId?: string | null;
}

export interface CustomerJWTPayload {
  customerId: string;
  email: string;
  role: 'customer';
  permissions: string[];
  branchId?: string | null;
}

export type RefreshTokenPayload =
  | { type: 'staff'; userId: string }
  | { type: 'customer'; customerId: string };

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      customer?: CustomerJWTPayload;
    }
  }
}
export {};
