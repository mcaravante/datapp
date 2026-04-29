import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import type { AuthenticatedRequest, AuthenticatedUser } from './types';

/**
 * Verifies a Bearer JWT (RS256, issuer=cdp-api), checks that its `jti`
 * still maps to an active Session row (so revocation works), and
 * populates `req.user` with the decoded principal.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('bearer '.length).trim();

    let payload;
    try {
      payload = this.auth.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const valid = await this.sessions.isValid(payload.jti);
    if (!valid) throw new UnauthorizedException('Session revoked');

    const user: AuthenticatedUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      tenantId: payload.tenant_id,
      sessionId: payload.jti,
    };
    req.user = user;
    return true;
  }
}
