import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../modules/auth/types';

/**
 * Global exception filter that:
 *   1. Forwards 5xx and unknown errors to Sentry with the active user
 *      and request URL as tags (no body, to keep PII out).
 *   2. Falls back to Nest's BaseExceptionFilter so the HTTP response
 *      shape stays exactly the same as before.
 *
 * We DO NOT report 4xx — those are user errors and would drown the
 * signal. ThrottlerException + UnauthorizedException are explicitly
 * ignored upstream in `initSentry()` for the same reason.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = httpStatusOf(exception);
    if (status >= 500) {
      const req = host.switchToHttp().getRequest<AuthenticatedRequest>();
      Sentry.withScope((scope) => {
        scope.setTag('http.method', req.method);
        scope.setTag('http.route', routeOf(req));
        scope.setTag('http.status', String(status));
        if (req.user) {
          // Email is the only PII we attach — it's already on the user
          // record and helps triage. Body / query stay out.
          scope.setUser({ id: req.user.id, email: req.user.email });
        }
        Sentry.captureException(exception);
      });
      this.logger.error(`Unhandled ${String(status)} on ${req.method} ${routeOf(req)}`, exception);
    }
    super.catch(exception, host);
  }
}

function httpStatusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function routeOf(req: Request): string {
  // Prefer the matched route template (e.g. `/v1/admin/users/:id`) over
  // the raw URL so high-cardinality paths don't fragment in Sentry.
  // Express stores it on `req.route?.path` once the matcher runs.
  const route = (req as Request & { route?: { path?: string } }).route;
  return route?.path ?? req.path;
}
