import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthenticatedUser } from './types';

/**
 * Verifies a Bearer JWT (RS256, issuer=cdp-api), populates `req.user` with
 * the decoded principal. Apply via `@UseGuards(JwtGuard)` on any admin
 * route.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('bearer '.length).trim();
    try {
      const payload = this.auth.verifyToken(token);
      const user: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        tenantId: payload.tenant_id,
      };
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
