import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@cdp/db';
import type { AuditAction } from '@cdp/db';
import { PrismaService } from '../../db/prisma.service';

export interface AuditEntry {
  tenantId: string | null;
  userId: string | null;
  action: AuditAction;
  /** Resource bucket — e.g. `auth`, `auth.password`, `auth.two_factor`. */
  entity: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/**
 * Centralized audit logger. Used for security-relevant events that
 * should leave a forensic trail even when the action itself succeeded
 * (login, 2FA changes, password reset, session revoke, etc.).
 *
 * `log()` swallows DB errors on purpose — failing to write an audit
 * row should never break the user-facing flow. Errors land in Pino at
 * warn level so monitoring picks them up.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          before: entry.before ?? Prisma.JsonNull,
          after: entry.after ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      this.logger.warn(
        {
          err,
          action: entry.action,
          entity: entry.entity,
          tenantId: entry.tenantId,
          userId: entry.userId,
        },
        'Audit log write failed',
      );
    }
  }
}
