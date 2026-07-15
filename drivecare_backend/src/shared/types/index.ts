export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
export {};
