import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../db/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';

const CODE_COUNT = 10;

/**
 * 2FA recovery codes — 10 single-use backup codes for users who lose
 * access to their authenticator app. Plaintext is shown once at
 * generation; the DB only stores `sha256(code)` so a leaked dump is
 * useless.
 *
 * Format: `xxxx-xxxx` (8 lowercase hex chars + a dash for readability).
 * 32 bits of entropy each. Brute-forcing one of 10 codes against the
 * login rate limit (5/min) takes ~12.5 years on average — same blast
 * radius as a TOTP guess.
 */
@Injectable()
export class RecoveryCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Replace every existing code with a fresh batch. Returns the
   * plaintext codes — the only chance for the user to see them.
   */
  async generate(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const codes: string[] = [];
    for (let i = 0; i < CODE_COUNT; i += 1) codes.push(makeCode());

    await this.prisma.$transaction(async (tx) => {
      await tx.userRecoveryCode.deleteMany({ where: { userId } });
      await tx.userRecoveryCode.createMany({
        data: codes.map((code) => ({
          userId,
          codeHash: sha256Hex(normalize(code)),
        })),
      });
    });

    return codes;
  }

  /**
   * Re-issue a fresh batch, but require the user's current password
   * (so a stolen session alone can't refresh the codes silently).
   */
  async regenerate(userId: string, password: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, tenantId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) {
      // Google-only user with no password set — they can't confirm
      // ownership via password so this flow doesn't apply to them.
      throw new UnauthorizedException('Wrong password');
    }
    const ok = await AuthService.verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Wrong password');
    const codes = await this.generate(userId);
    await this.audit.log({
      tenantId: user.tenantId,
      userId,
      action: 'recovery_codes_generated',
      entity: 'auth.two_factor',
      entityId: userId,
      after: { count: codes.length },
    });
    return codes;
  }

  /**
   * Try to consume a recovery code during login. Returns true on
   * success and atomically marks the code used (so retries fail).
   */
  async consume(userId: string, code: string): Promise<boolean> {
    const codeHash = sha256Hex(normalize(code));
    const result = await this.prisma.userRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Count of codes still usable. Surfaced on the security panel. */
  async remaining(userId: string): Promise<number> {
    return this.prisma.userRecoveryCode.count({
      where: { userId, usedAt: null },
    });
  }

  /** Wipe every code for a user — called when 2FA is disabled or reset. */
  async clear(userId: string): Promise<void> {
    await this.prisma.userRecoveryCode.deleteMany({ where: { userId } });
  }
}

function makeCode(): string {
  const bytes = crypto.randomBytes(4); // 32 bits
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

function normalize(code: string): string {
  // Accept user-typed codes with stray spaces, mixed case, missing dash.
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
