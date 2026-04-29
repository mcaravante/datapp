import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../db/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuthService } from './auth.service';
import { RecoveryCodeService } from './recovery-code.service';

const ISSUER = 'CDP Admin';
// otplib defaults to a 1-step (30s) window. Allow ±1 step to absorb
// small clock drift without loosening security meaningfully.
authenticator.options = { window: 1 };

export interface EnrollmentResponse {
  /**
   * `otpauth://` URL to encode in a QR. Google Authenticator, Authy,
   * 1Password, etc. all consume this format.
   */
  otpauth_url: string;
  /** PNG data URL of the QR for the otpauth URL. */
  qr_data_url: string;
  /** Same secret in plaintext base32 — for manual entry when scanning fails. */
  manual_entry_secret: string;
}

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly recoveryCodes: RecoveryCodeService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Generate a fresh TOTP secret for the user, persist it encrypted
   * with verifiedAt=null. The user must call `verify()` with a valid
   * code from their authenticator before 2FA actually gates login.
   * If a verified secret already exists this errors out — the user has
   * to disable first.
   */
  async enroll(userId: string): Promise<EnrollmentResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { totpSecret: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.totpSecret?.verifiedAt) {
      throw new ConflictException('2FA already enabled — disable it first to re-enroll');
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth, { errorCorrectionLevel: 'M' });
    const encrypted = this.crypto.encrypt(secret);

    await this.prisma.$transaction(async (tx) => {
      // Replace any existing unverified secret in place so we don't
      // litter `user_totp_secret` with abandoned rows.
      if (user.totpSecret) {
        await tx.userTotpSecret.update({
          where: { id: user.totpSecret.id },
          data: { secretEncrypted: encrypted, verifiedAt: null },
        });
      } else {
        const created = await tx.userTotpSecret.create({
          data: { secretEncrypted: encrypted },
        });
        await tx.user.update({
          where: { id: userId },
          data: { totpSecretId: created.id },
        });
      }
    });

    return {
      otpauth_url: otpauth,
      qr_data_url: qrDataUrl,
      manual_entry_secret: secret,
    };
  }

  /**
   * Confirm enrollment by validating a code. Marks the secret as
   * verified, generates a fresh batch of recovery codes, and returns
   * them in plaintext — the only time the user gets to see them.
   */
  async verify(userId: string, code: string): Promise<{ recovery_codes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { totpSecret: true },
    });
    if (!user?.totpSecret) {
      throw new BadRequestException('2FA enrollment not started');
    }
    const secret = this.crypto.decrypt(Buffer.from(user.totpSecret.secretEncrypted));
    if (!authenticator.check(stripCode(code), secret)) {
      throw new UnauthorizedException('Invalid code');
    }
    await this.prisma.userTotpSecret.update({
      where: { id: user.totpSecret.id },
      data: { verifiedAt: new Date() },
    });
    const codes = await this.recoveryCodes.generate(userId);
    await this.audit.log({
      tenantId: user.tenantId,
      userId,
      action: 'two_factor_enrolled',
      entity: 'auth.two_factor',
      entityId: userId,
      after: { recovery_codes_issued: codes.length },
    });
    return { recovery_codes: codes };
  }

  /**
   * Disable 2FA for the user. Requires the user's current password to
   * make a stolen session insufficient to weaken the account.
   */
  async disable(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, totpSecretId: true, tenantId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) {
      // Google-only user — disabling 2FA via password isn't possible
      // for them. Admin reset is the supported path.
      throw new UnauthorizedException('Wrong password');
    }
    const ok = await AuthService.verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Wrong password');
    if (!user.totpSecretId) return;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { totpSecretId: null },
      }),
      this.prisma.userTotpSecret.delete({ where: { id: user.totpSecretId } }),
      this.prisma.userRecoveryCode.deleteMany({ where: { userId } }),
    ]);

    await this.audit.log({
      tenantId: user.tenantId,
      userId,
      action: 'two_factor_disabled',
      entity: 'auth.two_factor',
      entityId: userId,
    });
  }

  /**
   * Admin override: drop a user's 2FA without their password (to
   * unblock them when they lose the authenticator). The audit row
   * records the acting admin so the trail isn't ambiguous.
   */
  async adminReset(
    userId: string,
    actor?: { id: string; ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecretId: true, tenantId: true },
    });
    if (!user?.totpSecretId) {
      // Still drop any orphan recovery codes from a half-finished setup.
      await this.recoveryCodes.clear(userId);
      return;
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { totpSecretId: null } }),
      this.prisma.userTotpSecret.delete({ where: { id: user.totpSecretId } }),
      this.prisma.userRecoveryCode.deleteMany({ where: { userId } }),
    ]);

    await this.audit.log({
      tenantId: user.tenantId,
      userId: actor?.id ?? null,
      action: 'two_factor_admin_reset',
      entity: 'auth.two_factor',
      entityId: userId,
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
    });
  }

  /** Whether the user has verified 2FA active right now. */
  async isEnabled(userId: string): Promise<boolean> {
    const secret = await this.prisma.userTotpSecret.findFirst({
      where: { user: { id: userId } },
      select: { verifiedAt: true },
    });
    return secret?.verifiedAt !== undefined && secret.verifiedAt !== null;
  }

  /** Validate a TOTP code against the user's stored secret. Used during login. */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const secret = await this.prisma.userTotpSecret.findFirst({
      where: { user: { id: userId }, verifiedAt: { not: null } },
      select: { secretEncrypted: true },
    });
    if (!secret) return false;
    const plain = this.crypto.decrypt(Buffer.from(secret.secretEncrypted));
    return authenticator.check(stripCode(code), plain);
  }
}

function stripCode(raw: string): string {
  // Authenticator apps render `123 456`; users paste both. Normalize.
  return raw.replace(/\s+/g, '').trim();
}
