import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from './types';

/**
 * Pulls the authenticated user out of the request. Throws if used on a
 * route without `@UseGuards(JwtGuard)` upstream.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new UnauthorizedException('Authenticated user not present on request');
    return req.user;
  },
);
