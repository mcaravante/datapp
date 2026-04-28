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
import { CryptoService } from '../crypto/crypto.service';
import { AuthService } from './auth.service';

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
   * verified; from this call onward, login requires the TOTP code.
   */
  async verify(userId: string, code: string): Promise<void> {
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
  }

  /**
   * Disable 2FA for the user. Requires the user's current password to
   * make a stolen session insufficient to weaken the account.
   */
  async disable(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, totpSecretId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const ok = await AuthService.verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Wrong password');
    if (!user.totpSecretId) return;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { totpSecretId: null },
      }),
      this.prisma.userTotpSecret.delete({ where: { id: user.totpSecretId } }),
    ]);
  }

  /**
   * Admin override: drop a user's 2FA without their password (to
   * unblock them when they lose the authenticator). Caller is
   * audit-logged separately.
   */
  async adminReset(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecretId: true },
    });
    if (!user?.totpSecretId) return;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { totpSecretId: null } }),
      this.prisma.userTotpSecret.delete({ where: { id: user.totpSecretId } }),
    ]);
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
