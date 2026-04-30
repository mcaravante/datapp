import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { AuthService, TOKEN_TTL_SECONDS } from './auth.service';

function generateRsaKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const { privateKey, publicKey } = generateRsaKeys();

function makeJwtService(): JwtService {
  return new JwtService({
    privateKey,
    publicKey,
    signOptions: { algorithm: 'RS256', issuer: 'datapp-api' },
    verifyOptions: { algorithms: ['RS256'], issuer: 'datapp-api' },
  });
}

interface MockPrismaUser {
  id: string;
  tenantId: string | null;
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'super_admin' | 'analyst' | 'viewer';
}

function makeService(user: MockPrismaUser | null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = { get: vi.fn() } as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cryptoSvc = { encrypt: vi.fn(), decrypt: vi.fn() } as any;
  const sessions = {
    issue: vi.fn().mockResolvedValue('019ddddd-ddd-7000-8000-000000000001'),
    isValid: vi.fn().mockResolvedValue(true),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    purgeExpired: vi.fn().mockResolvedValue(0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const throttler = {
    assertNotThrottled: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const recoveryCodes = {
    consume: vi.fn().mockResolvedValue(false),
    generate: vi.fn().mockResolvedValue([]),
    regenerate: vi.fn().mockResolvedValue([]),
    remaining: vi.fn().mockResolvedValue(0),
    clear: vi.fn().mockResolvedValue(undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const audit = {
    log: vi.fn().mockResolvedValue(undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new AuthService(
    prisma,
    makeJwtService(),
    config,
    cryptoSvc,
    sessions,
    throttler,
    recoveryCodes,
    audit,
  );
}

describe('AuthService.hashPassword + verifyPassword', () => {
  it('hashes and verifies a password (round-trip)', async () => {
    const hash = await AuthService.hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await AuthService.verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await AuthService.hashPassword('hunter2');
    expect(await AuthService.verifyPassword('hunter3', hash)).toBe(false);
  });

  it('returns false for malformed hashes (does not throw)', async () => {
    expect(await AuthService.verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});

describe('AuthService.signToken + verifyToken', () => {
  it('issues a token that round-trips back to the same payload', () => {
    const svc = makeService(null);
    const principal = {
      id: '019dc6fc-2f60-7333-b323-baac02c03f26',
      email: 'admin@cdp.local',
      name: 'Admin',
      role: 'admin' as const,
      tenantId: '019dc614-1d43-7183-8773-a5bd5dd33ca1',
    };
    const { token, expiresIn } = svc.signToken(principal, 'test-jti');
    expect(expiresIn).toBe(TOKEN_TTL_SECONDS);
    const decoded = svc.verifyToken(token);
    expect(decoded.sub).toBe(principal.id);
    expect(decoded.email).toBe(principal.email);
    expect(decoded.role).toBe(principal.role);
    expect(decoded.tenant_id).toBe(principal.tenantId);
    expect(decoded.jti).toBe('test-jti');
    expect(decoded.iss).toBe('datapp-api');
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('rejects a tampered token', () => {
    const svc = makeService(null);
    const { token } = svc.signToken(
      {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'a@b.c',
        name: 'X',
        role: 'viewer',
        tenantId: null,
      },
      'test-jti',
    );
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'attacker', role: 'super_admin' })).toString(
      'base64url',
    );
    const tampered = parts.join('.');
    expect(() => svc.verifyToken(tampered)).toThrow();
  });
});

describe('AuthService.login', () => {
  let validUser: MockPrismaUser;
  beforeEach(async () => {
    validUser = {
      id: '019dc6fc-2f60-7333-b323-baac02c03f26',
      tenantId: '019dc614-1d43-7183-8773-a5bd5dd33ca1',
      email: 'admin@cdp.local',
      passwordHash: await AuthService.hashPassword('s3cret-passw0rd'),
      name: 'Admin',
      role: 'admin',
    };
  });

  it('returns a token + user on correct credentials', async () => {
    const svc = makeService(validUser);
    const out = await svc.login('admin@cdp.local', 's3cret-passw0rd');
    expect(out.access_token).toBeTruthy();
    expect(out.token_type).toBe('Bearer');
    expect(out.user.email).toBe('admin@cdp.local');
    expect(out.user.role).toBe('admin');
  });

  it('lowercases the email lookup', async () => {
    const svc = makeService(validUser);
    const out = await svc.login('ADMIN@CDP.local', 's3cret-passw0rd');
    expect(out.user.email).toBe('admin@cdp.local');
  });

  it('rejects with 401 on a bad password', async () => {
    const svc = makeService(validUser);
    await expect(svc.login('admin@cdp.local', 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects with 401 on a missing email', async () => {
    const svc = makeService(null);
    await expect(svc.login('nobody@cdp.local', 'anything')).rejects.toThrow(UnauthorizedException);
  });
});
