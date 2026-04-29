import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

/**
 * Server-side session registry. Every issued JWT has a corresponding row
 * here whose `id` is the JWT's `jti`. JwtGuard treats the row as the
 * source of truth: missing or expired = revoked. Logout, password reset,
 * 2FA reset, and user deletion all delete the row(s) so outstanding
 * tokens become invalid before their natural `exp`.
 */
@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionsService.name);
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    // Hourly opportunistic purge. Each process runs it independently;
    // duplicate work is harmless because the underlying delete is a no-op.
    this.cleanupInterval = setInterval(
      () => {
        void this.purgeExpired().catch((err: unknown) => {
          this.logger.warn({ err }, 'Session cleanup failed');
        });
      },
      60 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  async issue(params: {
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<string> {
    const session = await this.prisma.session.create({
      data: {
        userId: params.userId,
        expiresAt: params.expiresAt,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
      select: { id: true },
    });
    return session.id;
  }

  async isValid(sessionId: string | undefined | null): Promise<boolean> {
    if (!sessionId) return false;
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { expiresAt: true },
    });
    if (!session) return false;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
      return false;
    }
    return true;
  }

  async revoke(sessionId: string | undefined | null): Promise<void> {
    if (!sessionId) return;
    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async purgeExpired(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
