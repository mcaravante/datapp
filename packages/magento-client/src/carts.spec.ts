import { describe, it, expect, vi } from 'vitest';
import { MagentoCartsResource } from './carts';
import type { MagentoHttpClient } from './http';

function makeStubHttp() {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    putJson: vi.fn(),
    deleteJson: vi.fn(),
  } as unknown as MagentoHttpClient & { getJson: ReturnType<typeof vi.fn> };
}

describe('MagentoCartsResource.getMaskedId', () => {
  it('GETs /rest/V1/pupe-abandoned/masked-id/:quoteId and returns the bare masked id', async () => {
    const http = makeStubHttp();
    http.getJson.mockResolvedValueOnce('aBcD1234eF5678gH9012iJ3456kL7890');

    const sut = new MagentoCartsResource(http);
    const out = await sut.getMaskedId(42);

    expect(http.getJson).toHaveBeenCalledWith('/rest/V1/pupe-abandoned/masked-id/42');
    expect(out).toBe('aBcD1234eF5678gH9012iJ3456kL7890');
  });

  it('rejects responses that do not match the 32-char alphanumeric format', async () => {
    const http = makeStubHttp();
    http.getJson.mockResolvedValueOnce('too-short');

    const sut = new MagentoCartsResource(http);
    await expect(sut.getMaskedId(42)).rejects.toThrow();
  });

  it('rejects non-string responses (defensive — old envelope shape)', async () => {
    const http = makeStubHttp();
    http.getJson.mockResolvedValueOnce({ masked_id: 'aBcD1234eF5678gH9012iJ3456kL7890' });

    const sut = new MagentoCartsResource(http);
    await expect(sut.getMaskedId(42)).rejects.toThrow();
  });

  it('rejects responses with non-alphanumeric characters', async () => {
    const http = makeStubHttp();
    http.getJson.mockResolvedValueOnce('!@#$%^&*()_+1234567890123456789012');

    const sut = new MagentoCartsResource(http);
    await expect(sut.getMaskedId(42)).rejects.toThrow();
  });

  it('propagates the underlying HTTP error (e.g. 404 from Magento)', async () => {
    const http = makeStubHttp();
    const networkError = new Error('Magento 404 for /rest/V1/pupe-abandoned/masked-id/9999');
    http.getJson.mockRejectedValueOnce(networkError);

    const sut = new MagentoCartsResource(http);
    await expect(sut.getMaskedId(9999)).rejects.toThrow(/404/);
  });
});
