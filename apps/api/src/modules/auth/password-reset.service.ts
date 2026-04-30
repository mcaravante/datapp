import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import type Redis from 'ioredis';
import type { Env } from '../../config/env';
import { PrismaService } from '../../db/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';
import { AuthService } from './auth.service';
import { AUTH_REDIS } from './auth.tokens';
import { SessionsService } from './sessions.service';

const TOKEN_BYTES = 32; // 256 bits → 64 hex chars after sha256
const TOKEN_TTL_MIN = 30;
const FORGOT_IP_LIMIT = 3;
const FORGOT_IP_TTL_S = 60 * 60; // 3 forgot-password requests / hour / IP

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly adminUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly sessions: SessionsService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    @Inject(AUTH_REDIS) private readonly redis: Redis,
  ) {
    this.adminUrl = this.config.get<string>('APP_URL_ADMIN', { infer: true });
  }

  /**
   * Issue a reset token, email it to the user, and persist only its
   * sha256. Always succeeds silently — the response shape never reveals
   * whether the email exists, to prevent enumeration. An IP-level
   * counter limits how many of these a single source can trigger.
   */
  async requestReset(email: string, ip: string | null, userAgent: string | null): Promise<void> {
    if (ip) {
      const key = `forgot:ip:${ip}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, FORGOT_IP_TTL_S);
      if (count > FORGOT_IP_LIMIT) {
        // Silently swallow — the caller already returns 204 unconditionally.
        this.logger.warn(`Forgot-password rate-limited for IP ${ip}`);
        return;
      }
    }

    const lowered = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: lowered },
      select: { id: true, email: true, name: true, tenantId: true },
    });
    if (!user) return;

    const plaintext = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const tokenHash = sha256Hex(plaintext);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

    // Invalidate any prior unused tokens for this user; one active token at a time.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: ip,
        userAgent,
      },
    });

    const link = `${this.adminUrl.replace(/\/$/, '')}/reset?token=${plaintext}`;

    await this.mailer.send({
      to: user.email,
      subject: 'Restablecer tu contraseña',
      text: [
        `Hola ${user.name},`,
        '',
        'Recibimos una solicitud para restablecer tu contraseña en Datapp.',
        `Hacé clic en este enlace dentro de los próximos ${TOKEN_TTL_MIN.toString()} minutos:`,
        '',
        link,
        '',
        'Si no fuiste vos, ignorá este mensaje — tu contraseña actual sigue funcionando.',
      ].join('\n'),
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'password_reset_requested',
      entity: 'auth.password',
      entityId: user.id,
      ip,
      userAgent,
    });
  }

  /**
   * Consume a reset token: set the new password, delete the token row,
   * and revoke every outstanding session for the user so the old
   * password's tokens stop working immediately.
   */
  async resetPassword(plaintextToken: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters');
    }
    const tokenHash = sha256Hex(plaintextToken);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { tenantId: true } },
      },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await AuthService.hashPassword(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
      // Delete the token row (single-use). deleteMany so a parallel reset
      // of an already-deleted row doesn't throw.
      await tx.passwordResetToken.deleteMany({
        where: { id: row.id },
      });
    });

    // Revoke outside the transaction — session table cascade is best-effort.
    await this.sessions.revokeAllForUser(row.userId);

    await this.audit.log({
      tenantId: row.user.tenantId,
      userId: row.userId,
      action: 'password_reset_completed',
      entity: 'auth.password',
      entityId: row.userId,
    });
  }
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
