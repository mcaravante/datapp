import type { Request } from 'express';
import type { UserRole } from '@cdp/db';

/** Decoded JWT payload + the request principal we attach in JwtGuard. */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: UserRole;
  tenant_id: string | null;
  iat?: number;
  exp?: number;
  iss?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
