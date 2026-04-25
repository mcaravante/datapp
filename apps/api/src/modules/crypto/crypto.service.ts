import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Envelope-encrypts secrets at rest using AES-256-GCM with the master key
 * from `ENCRYPTION_MASTER_KEY` (32-byte hex).
 *
 * Output layout: `[12-byte IV][16-byte auth tag][ciphertext]`. Stored in
 * `Bytes` columns. The auth tag protects against tampering.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const hex = config.get<Env['ENCRYPTION_MASTER_KEY']>('ENCRYPTION_MASTER_KEY', { infer: true });
    if (typeof hex !== 'string' || hex.length !== 64) {
      throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes hex (64 chars)');
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]);
  }

  decrypt(buf: Buffer): string {
    if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error('ciphertext too short');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ct = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
