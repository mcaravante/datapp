import { describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service';

const fixedKey = 'a'.repeat(64); // 32 bytes hex

function makeService(keyHex: string = fixedKey): CryptoService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeConfig = { get: (_name: string) => keyHex } as any;
  return new CryptoService(fakeConfig);
}

describe('CryptoService', () => {
  it('round-trips ASCII', () => {
    const svc = makeService();
    const ct = svc.encrypt('hello world');
    expect(svc.decrypt(ct)).toBe('hello world');
  });

  it('round-trips UTF-8', () => {
    const svc = makeService();
    const plain = 'Avenida Córdoba 1234, Tigre — Argentina 🇦🇷';
    expect(svc.decrypt(svc.encrypt(plain))).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const svc = makeService();
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(Buffer.compare(a, b)).not.toBe(0);
  });

  it('rejects tampered ciphertexts', () => {
    const svc = makeService();
    const ct = svc.encrypt('do not change me');
    const tampered = Buffer.from(ct);
    const last = tampered.length - 1;
    tampered.writeUInt8((tampered.readUInt8(last) ^ 0x01) & 0xff, last);
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('rejects malformed ciphertexts', () => {
    const svc = makeService();
    expect(() => svc.decrypt(Buffer.from([0x00, 0x01]))).toThrow(/too short/);
  });

  it('throws when the master key is the wrong length', () => {
    expect(() => makeService('shortkey')).toThrow(/32 bytes hex/);
  });
});
